import * as React from "react"
import { cn } from "cn"
import { Slot as SlotPrimitive, Tooltip as TooltipPrimitive } from "radix-ui"

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

// An unavailable control that names its reason with its own aria-describedby (an sr-only sibling, so it is read while
// the tooltip is closed too) keeps that description alone: Radix adds the open content's id, which holds the same
// reason, so it would be read twice. Between Radix's trigger and the control, the trigger's props
// are merged into the control again by Radix's Slot (handlers, ref, class), without the added id when `own`. Any other
// trigger keeps Radix's description. Every asChild trigger goes through this layer, unavailable or not: a control that
// turns unavailable while focused (Play prototype losing its frame's mark) must stay the same element, or React mounts
// a new button and focus falls to the page.
function OwnDescription({
  "aria-describedby": added,
  own,
  control,
  ...props
}: { "aria-describedby"?: string; own: boolean; control: React.ReactElement } & Record<string, unknown>) {
  return <SlotPrimitive.Slot {...props} {...(own || added === undefined ? {} : { "aria-describedby": added })}>{control}</SlotPrimitive.Slot>
}

function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const element = asChild === true && React.isValidElement<Record<string, unknown>>(children)
  const own = element
    && (children.props["aria-disabled"] === true || children.props["aria-disabled"] === "true")
    && typeof children.props["aria-describedby"] === "string"
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" asChild={asChild} {...props}>
      {element ? <OwnDescription own={own} control={children} /> : children}
    </TooltipPrimitive.Trigger>
  )
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
