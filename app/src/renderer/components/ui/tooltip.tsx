import * as React from "react"
import { cn } from "cn"
import { Slot as SlotPrimitive, Tooltip as TooltipPrimitive } from "radix-ui"

// Radix's own delay defaults, which shadcn's template had set to 0, so passing over controls does not flash labels. Content is not
// hoverable: a tooltip is a label, so heading for the capsule must not keep it open over neighbouring controls.
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

// An unavailable control's own sr-only aria-describedby stays alone: Radix's added content id holds the same reason, read twice.
// Every asChild trigger goes through this layer so a control turning unavailable while focused stays the same element.
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
    && (children.props["aria-disabled"] === true || children.props["aria-disabled"] === "true" || children.props["data-own-description"] !== undefined)
    && typeof children.props["aria-describedby"] === "string"
  return (
    <TooltipPrimitive.Trigger data-slot="tooltip-trigger" asChild={asChild} {...props}>
      {element ? <OwnDescription own={own} control={children} /> : children}
    </TooltipPrimitive.Trigger>
  )
}

// A tooltip open over a host's row is the top dismissable layer, so Radix gives it the first Esc and the host would stay open; a
// host provides its close here so that Esc closes it too. A tooltip's own onEscapeKeyDown still decides for itself.
const TooltipEscape = React.createContext<(() => void) | null>(null)

// `container`: a modal dialog sits in the top layer, above anything portalled to the body, so a tooltip inside one is
// portalled into that dialog.
function TooltipContent({
  className,
  sideOffset = 4,
  container,
  onEscapeKeyDown,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { container?: Element | null | undefined }) {
  const host = React.useContext(TooltipEscape)
  const escape = onEscapeKeyDown ?? (host ? () => host() : undefined)
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        // The capsule, its motion and the instant-open rule live in ds/surfaces.css; the
        // capsule has no arrow, so the default offset keeps it off the trigger's edge.
        className={cn("doan-tooltip z-50", className)}
        {...(escape ? { onEscapeKeyDown: escape } : {})}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipEscape, TooltipProvider }
