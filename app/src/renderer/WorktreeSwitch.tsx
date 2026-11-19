import { useId, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, FolderOpen, GitBranch, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { chipClass, ROW_ACTION_ICONS, ROW_ACTION_LABELS, type RowAction } from "./homeCards";
import { useRetry } from "./ListRetryButton";
import { isCut } from "./NameTip";
import type { WorktreeModel } from "./worktreeSwitchModel";

export interface WorktreeRecovery {
  action(name: RowAction, root: string): void | Promise<void>;
  projectSettings(root: string): void;
}

export function WorktreeSwitch({ model, reason, tabIndex, onWorktree, recovery, handOffFocus = false }: {
  model: WorktreeModel; reason?: string | null; tabIndex?: number; onWorktree(root: string): void;
  recovery?: WorktreeRecovery; handOffFocus?: boolean;
}) {
  const description = useId(), heading = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState(false);
  const [open, setOpen] = useState(false);
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const repair = model.rows.find(row => row.root === repairRoot);
  const moved = useRef(false);
  const retry = useRetry();
  if (reason && open) setOpen(false);
  const changeOpen = (next: boolean) => {
    if (next && reason) return;
    setOpen(next);
    setTip(false);
    if (next) setRepairRoot(null);
  };
  return <DropdownMenu.Root open={open && !reason} onOpenChange={changeOpen}>
    <Tooltip open={tip && !open} onOpenChange={next => setTip(next && (!!reason || isCut(trigger.current)))}>
      <TooltipTrigger asChild><DropdownMenu.Trigger asChild aria-disabled={reason ? true : undefined} aria-describedby={reason ? description : undefined}><button ref={trigger} type="button" className="doan-chip shell-branch wt-chip" data-ui-variant="translucent"
        aria-label={`Worktree: ${model.label}`} aria-disabled={reason ? true : undefined} aria-describedby={reason ? description : undefined}
        tabIndex={tabIndex} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
        <GitBranch aria-hidden="true" /><span>{model.label}</span></button></DropdownMenu.Trigger></TooltipTrigger>
      <TooltipContent side="bottom" className="hbw-tip">{reason ?? <><span>{model.label}</span><span>{model.path}</span></>}</TooltipContent>
    </Tooltip>
    {reason && <span className="sr-only" id={description}>{reason}</span>}
    <DropdownMenu.Portal><DropdownMenu.Content className={`doan-floating doan-menu shell-project-menu wt-menu${tabIndex === undefined ? "" : " shell-side-menu"}`}
      aria-labelledby={heading} align="start" sideOffset={4} collisionPadding={8} onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      onCloseAutoFocus={event => { if (moved.current) { event.preventDefault(); moved.current = false; } }}>
      <DropdownMenu.Label id={heading} className="doan-menu-head">Worktrees</DropdownMenu.Label>
      {model.rows.map(row => {
        const marked = repair?.state.kind === "repair" ? repair.root === row.root : row.current;
        return <DropdownMenu.Item key={row.root} className="doan-menu-item shell-worktree" aria-current={marked ? "true" : undefined}
          aria-disabled={row.state.kind === "disabled" || undefined} onSelect={event => {
            if (row.state.kind === "disabled") { event.preventDefault(); return; }
            if (row.state.kind === "repair") { event.preventDefault(); setRepairRoot(row.root); return; }
            if (row.current) return;
            moved.current = handOffFocus;
            onWorktree(row.root);
          }}>
          <GitBranch aria-hidden="true" /><span><span>{row.label}</span><small>{row.path}</small>
            {row.state.kind === "disabled" && !row.chip && <small className="shell-menu-reason">{row.state.reason}</small>}</span>
          {row.chip ? <span className={chipClass(row.chip)}>{row.chip}</span> : marked && <Check aria-hidden="true" />}
        </DropdownMenu.Item>;
      })}
      {recovery && repair?.state.kind === "repair" && <>
        <DropdownMenu.Separator className="doan-menu-sep" />
        <DropdownMenu.Item className="doan-menu-item" onSelect={() => void recovery.action("showInFinder", repair.root)}><FolderOpen aria-hidden="true" />{ROW_ACTION_LABELS.showInFinder}</DropdownMenu.Item>
        <DropdownMenu.Item className="doan-menu-item" onSelect={() => recovery.projectSettings(repair.root)}><Settings aria-hidden="true" />Project Settings</DropdownMenu.Item>
        {repair.state.actions.map(action => {
          const Icon = ROW_ACTION_ICONS[action];
          const running = action === "retry" && retry.running;
          return <DropdownMenu.Item key={action} className="doan-menu-item" aria-disabled={running || undefined} aria-busy={running || undefined} onSelect={event => {
            if (action === "retry") {
              event.preventDefault();
              retry.run(async () => { await recovery.action(action, repair.root); return true; });
            } else void recovery.action(action, repair.root);
          }}>{running ? <span className="doan-spinner" aria-hidden="true" /> : Icon && <Icon aria-hidden="true" />}{ROW_ACTION_LABELS[action]}</DropdownMenu.Item>;
        })}
      </>}
    </DropdownMenu.Content></DropdownMenu.Portal>
  </DropdownMenu.Root>;
}
