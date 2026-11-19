import { useId, useRef, useState, type SyntheticEvent } from "react";
import { DropdownMenu } from "radix-ui";
import { Check, FolderOpen, GitBranch, Settings } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { chipClass, ROW_ACTION_ICONS, ROW_ACTION_LABELS, type RowAction } from "./homeCards";
import { useMenuFocus } from "./useMenuFocus";
import { useRetry } from "./ListRetryButton";
import { isCut } from "./NameTip";
import type { WorktreeModel } from "./worktreeSwitchModel";

export interface WorktreeRecovery {
  action(name: RowAction, root: string): void | Promise<void>;
  projectSettings(root: string): void;
}

export function WorktreeSwitch({ model, reason, tabIndex, sidebar = false, onWorktree, recovery, handOffFocus = false, canvasKey = null, fallbackFocus }: {
  model: WorktreeModel; reason?: string | null; tabIndex?: number; sidebar?: boolean; onWorktree(root: string): void;
  recovery?: WorktreeRecovery; handOffFocus?: boolean; canvasKey?: string | null; fallbackFocus?(): void;
}) {
  const description = useId(), heading = useId();
  const [tip, setTip] = useState(false);
  const [open, setOpen] = useState(false);
  const [repairRoot, setRepairRoot] = useState<string | null>(null);
  const repair = model.rows.find(row => row.root === repairRoot);
  // If the list changed under an open menu, a press on a formerly available canvas reports the failed move.
  const offered = useRef(new Set<string>());
  const handOff = useRef(false);
  const { trigger, onCloseAutoFocus } = useMenuFocus(canvasKey, open, !reason, () => setOpen(false), fallbackFocus);
  const retry = useRetry();
  if (reason && open) setOpen(false);
  const changeOpen = (next: boolean) => {
    if (next && reason) return;
    setOpen(next);
    setTip(false);
    if (next) {
      setRepairRoot(null);
      offered.current = new Set(model.rows.filter(row => row.state.kind === "open" && !row.current).map(row => row.root));
    }
  };
  const stopTreeEvent = sidebar ? (event: SyntheticEvent) => event.stopPropagation() : undefined;
  return <DropdownMenu.Root open={open && !reason} onOpenChange={changeOpen}>
    <Tooltip open={tip && !open} onOpenChange={next => setTip(next && (!!reason || isCut(trigger.current)))}>
      <TooltipTrigger asChild><DropdownMenu.Trigger asChild aria-disabled={reason ? true : undefined} aria-describedby={reason ? description : undefined}><button ref={trigger} type="button" className="doan-chip shell-branch wt-chip" data-ui-variant="translucent"
        aria-label={`Worktree: ${model.label}`}
        tabIndex={tabIndex} onClick={stopTreeEvent} onKeyDown={stopTreeEvent}>
        <GitBranch aria-hidden="true" /><span>{model.label}</span></button></DropdownMenu.Trigger></TooltipTrigger>
      <TooltipContent side="bottom" className="wt-tip">{reason ?? <><span>{model.label}</span><span>{model.path}</span></>}</TooltipContent>
    </Tooltip>
    {reason && <span className="sr-only" id={description}>{reason}</span>}
    <DropdownMenu.Portal><DropdownMenu.Content className={`doan-floating doan-menu shell-project-menu wt-menu${sidebar ? " shell-side-menu" : ""}`}
      aria-labelledby={heading} align="start" sideOffset={4} collisionPadding={8} onClick={stopTreeEvent} onKeyDown={stopTreeEvent}
      onCloseAutoFocus={event => { if (handOff.current) { event.preventDefault(); handOff.current = false; } else onCloseAutoFocus(event); }}>
      <DropdownMenu.Label id={heading} className="doan-menu-head">Worktrees</DropdownMenu.Label>
      {model.rows.map(row => {
        const marked = repair ? row.root === repair.root : row.current;
        return <DropdownMenu.Item key={row.root} className="doan-menu-item shell-worktree" aria-current={marked ? "true" : undefined}
          aria-disabled={row.state.kind === "disabled" || undefined} onSelect={event => {
            if (row.state.kind === "disabled") {
              event.preventDefault();
              if (offered.current.has(row.root)) onWorktree(row.root);
              return;
            }
            if (row.state.kind === "repair") { event.preventDefault(); setRepairRoot(row.root); return; }
            if (row.current) return;
            // Close before navigation so this pick returns to the trigger like a normal menu selection.
            changeOpen(false);
            handOff.current = handOffFocus;
            onWorktree(row.root);
          }}>
          <GitBranch aria-hidden="true" /><span><span>{row.label}</span><small>{row.path}</small>
            {row.state.kind === "disabled" && !row.chip && <small className="shell-menu-reason">{row.state.reason}</small>}</span>
          {row.chip && <span className={chipClass(row.chip)}>{row.chip}</span>}
          {marked && <Check aria-hidden="true" />}
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
