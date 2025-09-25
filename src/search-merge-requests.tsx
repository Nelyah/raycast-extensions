import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useState, useCallback } from "react";
import { mergeRequestAccessories, MergeRequest, useMergeRequests, useApprovals } from "./gitlab";

function stateIcon(mr: MergeRequest) {
  if (mr.merged_at || mr.state === "merged") return "pr-merged.png";
  if (mr.state === "closed") return "pr-closed.png";
  return "pr-open.png";
}

export default function SearchMergeRequests() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<string>("created_by_me");
  const [state, setState] = useState<string>("opened");
  const { data, isLoading, revalidate } = useMergeRequests({ search, scope, state });
  const approvals = useApprovals(data || []);

  const changeScope = useCallback(
    (s: string) => {
      setScope(s);
      revalidate();
    },
    [revalidate]
  );

  return (
    <List
      searchBarPlaceholder="Search merge requests by title"
      onSearchTextChange={setSearch}
      isLoading={isLoading}
      throttle
      searchBarAccessory={
        <List.Dropdown tooltip="State" storeValue onChange={setState} defaultValue={state}>
          <List.Dropdown.Item title="Opened" value="opened" />
          <List.Dropdown.Item title="Merged" value="merged" />
          <List.Dropdown.Item title="Closed" value="closed" />
          <List.Dropdown.Item title="All" value="all" />
        </List.Dropdown>
      }
    >
      {data?.map((mr) => (
        <List.Item
          key={mr.id}
            title={mr.title}
            subtitle={`${mr.author.name} • !${mr.iid}`}
            icon={stateIcon(mr)}
            accessories={mergeRequestAccessories({ ...mr, approved: approvals[mr.id] === true })}
            actions={<MRActionPanel mr={mr} onRefresh={revalidate} scope={scope} changeScope={changeScope} />}
        />
      ))}
      {scope === "all" && !search && (
        <List.EmptyView
          title="Type to search across all merge requests"
          description="Searching 'all' without text is disabled to avoid timeouts."
        />
      )}
    </List>
  );
}

function MRActionPanel({
  mr,
  onRefresh,
  scope,
  changeScope,
}: {
  mr: MergeRequest;
  onRefresh: () => void;
  scope: string;
  changeScope: (s: string) => void;
}) {
  return (
    <ActionPanel>
      <Action.OpenInBrowser url={mr.web_url} />
      <ActionPanel.Section title="Change Scope">
        <Action
          title={`Scope: Assigned To Me${scope === "assigned_to_me" ? " (Current)" : ""}`}
          onAction={() => changeScope("assigned_to_me")}
          icon={Icon.Person}
          shortcut={{ modifiers: ["cmd", "shift"], key: "a" }}
        />
        <Action
          title={`Scope: Created By Me${scope === "created_by_me" ? " (Current)" : ""}`}
          onAction={() => changeScope("created_by_me")}
          icon={Icon.Pencil}
          shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
        />
        <Action
          title={`Scope: Reviewer${scope === "reviewer" ? " (Current)" : ""}`}
          onAction={() => changeScope("reviews_for_me")}
          icon={Icon.Eye}
                   shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
        />
        <Action
          title={`Scope: All${scope === "all" ? " (Current)" : ""}`}
          onAction={() => changeScope("all")}
          icon={Icon.Globe}
          shortcut={{ modifiers: ["cmd", "shift"], key: "g" }}
        />
      </ActionPanel.Section>
      <Action.CopyToClipboard title="Copy Web URL" content={mr.web_url} />
      <Action.CopyToClipboard title="Copy Branch" content={mr.source_branch} />
      <Action
        title="Refresh"
        icon={Icon.Repeat}
        shortcut={{ modifiers: ["cmd"], key: "r" }}
        onAction={() => onRefresh()}
      />
    </ActionPanel>
  );
}
