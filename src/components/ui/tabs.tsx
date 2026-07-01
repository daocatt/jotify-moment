"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list t-tabs inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const TabsList = React.forwardRef<
  HTMLDivElement,
  TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>
>(({ className, variant = "default", ...props }, ref) => {
  const pillRef = React.useRef<HTMLSpanElement>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)

  const movePill = React.useCallback((animate: boolean) => {
    const list = listRef.current
    const pill = pillRef.current
    if (!list || !pill) return

    const activeTab = list.querySelector<HTMLElement>('[data-active=""]') ||
      list.querySelector<HTMLElement>('[data-active="true"]') ||
      list.querySelector<HTMLElement>('[aria-selected="true"]')

    if (!activeTab) return

    const listRect = list.getBoundingClientRect()

    if (!animate) {
      const prev = pill.style.transition
      pill.style.transition = "none"
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`
      pill.style.width = `${activeTab.offsetWidth}px`
      void pill.offsetWidth
      pill.style.transition = prev
    } else {
      pill.style.transform = `translateX(${activeTab.offsetLeft}px)`
      pill.style.width = `${activeTab.offsetWidth}px`
    }
  }, [])

  const handleRef = React.useCallback((node: HTMLDivElement | null) => {
    listRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])

  React.useEffect(() => {
    movePill(false)
    const handleResize = () => movePill(false)
    window.addEventListener("resize", handleResize)

    const list = listRef.current
    let observer: MutationObserver | undefined
    if (list) {
      observer = new MutationObserver(() => movePill(true))
      observer.observe(list, {
        attributes: true,
        subtree: true,
        attributeFilter: ["data-active", "aria-selected"],
      })
    }

    return () => {
      window.removeEventListener("resize", handleResize)
      observer?.disconnect()
    }
  }, [movePill])

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      ref={handleRef}
      {...props}
    >
      {variant === "default" && (
        <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      )}
      {props.children}
    </TabsPrimitive.List>
  )
})
TabsList.displayName = "TabsList"

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "t-tab relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
