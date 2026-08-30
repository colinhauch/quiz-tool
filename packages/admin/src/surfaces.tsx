import type { ComponentType } from "react";
import { Packs } from "./Packs.js";
import { Users } from "./Users.js";
import { Results } from "./Results.js";
import { Feedback } from "./Feedback.js";
import { GraphHealth } from "./GraphHealth.js";
import { GeneratorPreview } from "./GeneratorPreview.js";

/** The six admin surfaces, in nav order. The `id` doubles as the surface's key. */
export type SurfaceId = "packs" | "users" | "results" | "feedback" | "health" | "generator";

export interface Surface {
  id: SurfaceId;
  label: string;
  component: ComponentType;
}

/**
 * The single registry the shell renders its nav and panes from. Each surface is
 * built by its own ticket (#136–#144) and slotted in here; the shell (#135) owns
 * only the chrome around them. Kept as data so adding a surface never means
 * touching the shell's layout.
 */
export const SURFACES: Surface[] = [
  { id: "packs", label: "Packs", component: Packs },
  { id: "users", label: "Users", component: Users },
  { id: "results", label: "Results", component: Results },
  { id: "feedback", label: "Feedback", component: Feedback },
  { id: "health", label: "Graph Health", component: GraphHealth },
  { id: "generator", label: "Generator Preview", component: GeneratorPreview },
];
