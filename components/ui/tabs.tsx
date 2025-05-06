"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const tabsListVariants = cva("inline-flex items-center justify-center gap-1 rounded-md bg-muted p-1 text-muted-foreground", {
  variants: {
    variant: {
      default: "bg-gray-100",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const Tabs = TabsPrimitive.Root;
const TabsList = TabsPrimitive.List;
const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex items-center justify-center rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-white data-[state=active]:text-foreground",
      className
    )}
    {...props}
  />
);
const TabsContent = TabsPrimitive.Content;

export { Tabs, TabsList, TabsTrigger, TabsContent };