import { itemRoutes } from "@/lib/lite/context-routes";

/** Process boundary, rework definition, and calendar. */
export const { GET, POST, PATCH } = itemRoutes(["process_boundary", "rework_definition", "calendar"]);
