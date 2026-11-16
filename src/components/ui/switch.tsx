"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-[2px] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none select-none cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50",
        "data-[size=default]:h-5 data-[size=default]:w-9",
        "data-[size=sm]:h-4 data-[size=sm]:w-7",
        // Unchecked state: refined border and soft inner shadow
        "data-unchecked:bg-zinc-200/90 data-unchecked:border data-unchecked:border-zinc-300/80 data-unchecked:shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]",
        "dark:data-unchecked:bg-zinc-700/80 dark:data-unchecked:border-zinc-600/80 dark:data-unchecked:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)]",
        // Checked state: vibrant WeChat/Apple emerald green with crisp border
        "data-checked:bg-emerald-500 data-checked:border data-checked:border-emerald-500 data-checked:shadow-[0_1px_3px_rgba(16,185,129,0.25)]",
        "dark:data-checked:bg-emerald-500 dark:data-checked:border-emerald-500",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-white dark:bg-white ring-0 shadow-[0_1px_2.5px_rgba(0,0,0,0.18),0_1.5px_6px_rgba(0,0,0,0.08)] border border-black/[0.04] transition-[transform,width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
          "group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-2.5",
          "group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-4",
          "group-data-[size=sm]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-checked:translate-x-3",
          "group-active/switch:w-4 group-data-[size=sm]/switch:group-active/switch:w-3"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
