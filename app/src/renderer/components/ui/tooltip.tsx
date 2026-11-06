import * as React from "react"
import { cn } from "cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

// The first tooltip waits so passing over controls does not flash labels; within the skip window the next one opens
// at once (Radix's own defaults, which shadcn's template had set to 0). Content is not hoverable: a tooltip is a label,
// so the pointer heading for the capsule must not keep it open over the controls beside its trigger.
function TooltipProvider({
  delayDuration = 700,
  skipDelayDuration = 300,
  disableHoverableContent = true,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // The capsule, its motion and the instant-open rule live in ds/surfaces.css; the
        // capsule has no arrow, so the default offset keeps it off the trigger's edge.
        className={cn("doan-tooltip z-50", className)}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
