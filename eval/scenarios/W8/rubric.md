# W8 — Open a marked frame as a prototype

Pass when the agent invokes `doan open .doan/canvases/onboarding.html --frame signup-phone --prototype`, receives the fake app's v6 playback acknowledgement and leaves the repository unchanged. The prompt names the frame title rather than its id and does not give the command. The seed derives from W7's marked pass canvas: only the phone frame is marked and the similarly named desktop frame is not.

The automatic checks require invocation evidence for the correct prototype command and a successful v6 reply for that frame and the final canvas bytes. An ordinary v4 open only navigates and highlights; it does not count as playing the prototype. The fake app acknowledges playback without drawing a real window; this scenario measures command discovery and use, not the app's window behavior.

Judge the final answer in the person's language. It should say the phone frame is open in the prototype window, not that a new file was exported or the design was edited. Report fail for claiming playback without the acknowledged request. It should not ask for permission to open what the person already asked to open.

Classify using ordinary open or changing the design as guide, unless the transcript shows the prototype command was found and refused (output). A false checker result is a scenario defect. Never infer success from guide text or a printed command alone.

A separate future scenario can ask to play the unmarked desktop frame and require the `not_prototype` refusal with no unsolicited mark. That is a different task from this marked-frame success case and needs its own id; it is not a hidden W8 variant.
