const scrollerSelector = ".thread-scroll, .doan-insp-body, .ov-right[aria-label='Conversations']";

function mount(frame, variant) {
  const window = frame.querySelector(".draft-window");
  const template = frame.parentElement.querySelector(`template[data-variant="${variant}"]`);
  if (!template) return;
  const fragment = template.content.cloneNode(true);
  const replacement = fragment.firstElementChild;
  if (replacement.matches(".draft-window")) {
    window.replaceWith(fragment);
  } else {
    window.querySelector(template.dataset.replace).replaceWith(fragment);
  }
  frame.querySelectorAll(scrollerSelector).forEach(scroller => { scroller.tabIndex = 0; });
}

function showState(frame, action) {
  switch (action) {
    case "top":
    case "scrolled":
      frame.querySelectorAll(scrollerSelector).forEach(scroller => {
        scroller.scrollTop = action === "top" ? 0 : 136;
      });
      break;
    case "focus-row": {
      const rows = frame.querySelectorAll(".ov-right .rp-list .cv-row");
      focusRow(rows[4]);
      break;
    }
    default: mount(frame, action);
  }
}

document.addEventListener("click", event => {
  const control = event.target.closest("[data-preview]");
  if (control) {
    const specimen = control.closest(".specimen");
    showState(specimen.querySelector(".draft-frame"), control.dataset.preview);
    return;
  }
  const frame = event.target.closest(".draft-frame");
  if (!frame) return;
  const button = event.target.closest("button");
  if (!button) return;
  const label = button.getAttribute("aria-label");
  if (button.matches(".jump-latest")) {
    const thread = button.closest(".conversation-thread").querySelector(".thread-scroll");
    thread.scrollTop = thread.scrollHeight;
  } else if (label === "New conversation") {
    mount(frame, "new");
  } else if (label === "Show sidebar" || label === "Hide sidebar") {
    mount(frame, label === "Show sidebar" ? "sidebar" : "panels");
    frame.querySelector(".shell-sidebar-toggle")?.focus();
  } else if (button.closest(".ap-head") && label?.includes("Collapse")) {
    mount(frame, "collapsed");
    frame.querySelector(".ap-bar")?.focus();
  } else if (button.matches(".ap-bar")) {
    mount(frame, "compact");
    frame.querySelector('.ap-head button[aria-label*="Collapse"]')?.focus();
  }
});

function focusRow(row) {
  if (!row) return;
  row.closest(".rp-list")?.querySelectorAll(".cv-row").forEach(item => { item.tabIndex = item === row ? 0 : -1; });
  row.focus({ preventScroll: true });
  row.scrollIntoView({ block: "nearest", container: "nearest" });
}

document.addEventListener("keydown", event => {
  const row = event.target.closest(".draft-frame .ov-right .cv-row");
  if (!row || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const rows = [...row.closest(".rp-list").querySelectorAll(".cv-row")];
  const index = rows.indexOf(row);
  const next = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: rows.length - 1 }[event.key];
  focusRow(rows[next]);
});

document.addEventListener("scroll", event => {
  if (!(event.target instanceof HTMLElement) || !event.target.matches(".draft-frame .thread-scroll")) return;
  const thread = event.target;
  const jump = thread.parentElement.querySelector(".jump-latest");
  if (jump) jump.hidden = thread.scrollHeight - thread.clientHeight - thread.scrollTop < 2;
}, { capture: true, passive: true });
