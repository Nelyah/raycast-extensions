import fetch from "node-fetch";
import { getPreferenceValues, showToast, Toast, Icon } from "@raycast/api";
import { useFetch } from "@raycast/utils";

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
