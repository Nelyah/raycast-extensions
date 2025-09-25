import fetch from "node-fetch";
import { getPreferenceValues, showToast, Toast, Icon, Color } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { useEffect, useState } from "react";

export interface MergeRequest {
  id: number;
  iid: number;
  project_id: number;
  title: string;
  description: string;
  state: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  web_url: string;
  author: {
    id: number;
    name: string;
    username: string;
    avatar_url: string | null;
  };
  reviewers?: Array<{
    id: number;
    name: string;
    username: string;
    avatar_url: string | null;
  }>; // present if API includes reviewers
  head_pipeline?: {
    id: number;
    status: string; // running | pending | success | failed | canceled | etc.
    web_url?: string;
  };
  approved?: boolean; // optional flag (GitLab exposes via separate approvals API or expanded fields)
  source_branch: string;
  target_branch: string;
  draft: boolean;
  work_in_progress: boolean | undefined; // compatibility old GitLab versions
  approvals_required?: number;
  upvotes: number;
  downvotes: number;
}

interface Prefs {
  gitlabInstance: string;
  gitlabToken: string;
}

function prefs(): Prefs {
  const { gitlabInstance, gitlabToken } = getPreferenceValues<Prefs>();
  return { gitlabInstance, gitlabToken };
}

export function buildGitLabURL(path: string, searchParams?: Record<string, string | number | undefined | null>) {
  const { gitlabInstance } = prefs();
  const url = new URL(path.replace(/^\//, ""), gitlabInstance.endsWith("/") ? gitlabInstance : gitlabInstance + "/");
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function gitlabFetch<T>(url: string): Promise<T> {
  const { gitlabToken } = prefs();
  const res = await fetch(url, {
    headers: {
      "PRIVATE-TOKEN": gitlabToken,
    },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export interface UseMergeRequestsParams {
  search?: string;
  scope?: "all" | "assigned_to_me" | "created_by_me" | string;
  state?: "opened" | "merged" | "closed" | "all" | string; // "all" handled client-side (omit)
  perPage?: number;
}

export function useMergeRequests(params: UseMergeRequestsParams) {
  const { search = "", scope = "assigned_to_me", state = "opened", perPage = 20 } = params;
  const { gitlabToken } = prefs();

  const effectiveState = state === "all" ? undefined : state;

  const shouldDefer = scope === "all" && !search; // likely huge dataset, wait for user input

  const url = buildGitLabURL("/api/v4/merge_requests", {
    search: search || undefined,
    in: search ? "title" : undefined,
    scope,
    state: effectiveState,
    order_by: "updated_at",
    sort: "desc",
    per_page: perPage,
  });

  if (!gitlabToken) {
    return {
      data: undefined as unknown as MergeRequest[] | undefined,
      isLoading: false,
      revalidate: () => {},
      error: new Error("GitLab token not set in preferences"),
    };
  }

  return useFetch<MergeRequest[]>(url, {
    keepPreviousData: true,
    execute: !shouldDefer,
    headers: { "PRIVATE-TOKEN": gitlabToken },
    onError(error) {
      showToast({
        style: Toast.Style.Failure,
        title: "Failed Loading Merge Requests",
        message: error instanceof Error ? error.message : String(error),
      });
    },
  });
}

export function mergeRequestAccessories(mr: MergeRequest) {
  const accessories: any[] = [];
  if (mr.head_pipeline?.status) {
    const icon = pipelineStatusToIcon(mr.head_pipeline.status);
    if (icon) {
      accessories.push({ icon, tooltip: `Pipeline: ${mr.head_pipeline.status}` });
    }
  }
  if (mr.approved) {
    accessories.push({ tag: { value: "APPROVED", color: Color.Green } });
  }
  if (mr.reviewers && mr.reviewers.length > 0) {
    const first = mr.reviewers[0];
    accessories.push({
      icon: first.avatar_url || Icon.Person,
      tag: "Reviews",
      tooltip: `Reviewer${mr.reviewers.length > 1 ? 's' : ''}: ${mr.reviewers.map((r) => r.name).join(', ')}`,
    });
  }
  accessories.push({
    tag: mr.state
  });
  accessories.push({
    date: new Date(mr.updated_at),
    tooltip: `Updated at ${new Date(mr.updated_at).toLocaleString()}`,
  });
  return accessories;
}

// Fetch approval status for each MR (simple variant). Limits to first 25 to reduce requests.
export function useApprovals(mrs: MergeRequest[]) {
  const { gitlabToken } = prefs();
  const [approvedMap, setApprovedMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!gitlabToken) return;
    if (!mrs || mrs.length === 0) return;
    const controller = new AbortController();
    const subset = mrs.slice(0, 25); // limit
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        subset.map(async (mr) => {
          try {
            const url = buildGitLabURL(`/api/v4/projects/${mr.project_id}/merge_requests/${mr.iid}/approvals`);
            const res = await fetch(url, {
              headers: { "PRIVATE-TOKEN": gitlabToken },
              signal: controller.signal,
            });
            if (!res.ok) return undefined;
            const json = (await res.json()) as {
              approved?: boolean;
              approvals_left?: number;
              approvals_required?: number;
              approved_by?: Array<{ user?: { id: number; name: string } }>;
            };
            // Logic: Show APPROVED only if approvals actually granted, not just because zero required.
            const approvalsRequired = json.approvals_required ?? 0;
            const approvalsLeft = json.approvals_left ?? (approvalsRequired === 0 ? 0 : undefined);
            const approversCount = json.approved_by?.length ?? 0;
            let isApproved = false;
            if (approvalsRequired > 0) {
              // Need explicit approvals; consider approved when left == 0 and at least one approver recorded
              if (approvalsLeft === 0 && approversCount > 0) {
                isApproved = true;
              }
            } else {
              // No approvals required: even if API says approved=true, we DO NOT mark as approved to avoid noise
              isApproved = false;
            }
            // Fallback: if API sends approved=true and approversCount>0 treat as approved
            if (!isApproved && json.approved === true && approversCount > 0) {
              isApproved = true;
            }
            return [mr.id, isApproved] as const;
          } catch (_e) {
            return undefined;
          }
        })
      );
      if (cancelled) return;
      const map: Record<number, boolean> = {};
      for (const e of entries) {
        if (e) map[e[0]] = e[1];
      }
      setApprovedMap((prev) => ({ ...prev, ...map }));
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [gitlabToken, mrs.map((m) => m.id).join(",")]);

  return approvedMap;
}

function pipelineStatusToIcon(status: string) {
  switch (status) {
    case "running":
      return "gitlab-running.png";
    case "pending":
      return "gitlab-pending.png";
    case "success":
      return "gitlab-success.png";
    default:
      return undefined;
  }
}
