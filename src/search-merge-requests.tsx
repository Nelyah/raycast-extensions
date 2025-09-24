import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { useState } from "react";
import { mergeRequestAccessories, MergeRequest, useMergeRequests } from "./gitlab";

function stateIcon(mr: MergeRequest) {
  if (mr.merged_at || mr.state === "merged") return "pr-merged.png";
  if (mr.state === "closed") return "pr-closed.png";
  return "pr-open.png";
}

export default function SearchMergeRequests() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<string>("assigned_to_me");
  const [state, setState] = useState<string>("opened");
  const { data, isLoading, revalidate } = useMergeRequests({ search, scope, state });

  return (
    <List
      searchBarPlaceholder="Search merge requests by title"
      onSearchTextChange={setSearch}
      isLoading={isLoading}
      throttle
      searchBarAccessory={
        <>
          <List.Dropdown tooltip="Scope" storeValue onChange={setScope} defaultValue={scope}>
            <List.Dropdown.Item title="Assigned To Me" value="assigned_to_me" />
            <List.Dropdown.Item title="Created By Me" value="created_by_me" />
            <List.Dropdown.Item title="All (need search)" value="all" />
          </List.Dropdown>
          <List.Dropdown tooltip="State" storeValue onChange={setState} defaultValue={state}>
            <List.Dropdown.Item title="Opened" value="opened" />
            <List.Dropdown.Item title="Merged" value="merged" />
            <List.Dropdown.Item title="Closed" value="closed" />
            <List.Dropdown.Item title="All" value="all" />
          </List.Dropdown>
        </>
      }
    >
      {data?.map((mr) => (
        <List.Item
          key={mr.id}
            title={mr.title}
            subtitle={`${mr.author.name} • !${mr.iid}`}
            icon={stateIcon(mr)}
            accessories={mergeRequestAccessories(mr)}
            actions={<MRActionPanel mr={mr} onRefresh={revalidate} />}
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

function MRActionPanel({ mr, onRefresh }: { mr: MergeRequest; onRefresh: () => void }) {
  return (
    <ActionPanel>
      <Action.OpenInBrowser url={mr.web_url} />
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
