import type { KeyboardEvent } from "react";
import { KEPT_LOCAL_FACT, STORAGE_LABELS, type StorageChoice } from "./storageRules";

// The "Doan files" choice of every setup screen (draft canvas local-doan-files frames setup-dialog, setup-panel, clone).
// The same names and descriptions everywhere; Project Settings draws them in its own settings rows.

export function StorageDescription({ choice }: { choice: StorageChoice }) {
  return choice === "repo" ? <>Git tracks these files. Commit them so your team gets your canvases and settings.</>
    : <>These files stay in this worktree on this Mac; other worktrees and Macs don’t get them. Git ignores them, so <code>git worktree remove</code> or <code>git clean -x</code> deletes them. To show someone a canvas, use Export in the canvas menu.</>;
}
const CHOICES: StorageChoice[] = ["repo", "local"];
const pickOnEnter = (pick: () => void) => (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); pick(); } };

// The Set Up dialog's field: radios with the settings radio row's parts inside the dialog's hairline card. kept: the
// project already keeps its files out of Git, so the field states that instead of offering the options.
export function StorageField({ id, value, kept, disabled, change }: { id: string; value: StorageChoice; kept: boolean; disabled: boolean; change: (value: StorageChoice) => void }) {
  return <div className="ob-field storage-field">
    <span className="ob-label" id={`${id}-label`}>Doan files</span>
    {kept ? <span className="storage-fact"><span className="value">{STORAGE_LABELS.local}</span><span className="ob-helper">{KEPT_LOCAL_FACT}</span></span>
      : <div className="storage-options" role="radiogroup" aria-labelledby={`${id}-label`}>{CHOICES.map(choice => <label className="storage-option" key={choice}>
        <input type="radio" name={id} checked={value === choice} disabled={disabled} onChange={() => change(choice)} onKeyDown={pickOnEnter(() => change(choice))} />
        <span className="ob-radio" aria-hidden="true" /><strong>{STORAGE_LABELS[choice]}</strong><small><StorageDescription choice={choice} /></small>
      </label>)}</div>}
  </div>;
}

// The setup panel and the clone screen: the options in one card like the Agent step's provider list, the radio in the
// provider mark's slot. While a clone runs the choice keeps its value and is disabled.
export function StorageCard({ id, value, kept, disabled, change, spaced = false }: { id: string; value: StorageChoice; kept: boolean; disabled: boolean; change: (value: StorageChoice) => void; spaced?: boolean }) {
  return <>
    <div className={spaced ? "ob-field-label ob-spaced" : "ob-field-label storage-label"} id={`${id}-label`}>Doan files</div>
    {kept ? <div className="doan-panel ob-provider-list"><div className="ob-provider"><div className="ob-provider-label"><strong>{STORAGE_LABELS.local}</strong><span>{KEPT_LOCAL_FACT}</span></div></div></div>
      : <div role="radiogroup" aria-labelledby={`${id}-label`} className="doan-panel ob-provider-list storage-list">{CHOICES.map(choice => <label className="ob-provider storage-row" key={choice}>
        <input type="radio" name={id} checked={value === choice} disabled={disabled} onChange={() => change(choice)} onKeyDown={pickOnEnter(() => change(choice))} />
        <span className="ob-provider-row"><span className="ob-provider-mark"><span className="ob-radio" aria-hidden="true" /></span>
          <span className="ob-provider-label"><strong>{STORAGE_LABELS[choice]}</strong><span><StorageDescription choice={choice} /></span></span></span>
      </label>)}</div>}
  </>;
}
