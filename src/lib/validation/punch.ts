import { z } from "zod";

export const punchPayloadSchema = z.object({
  action: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
  clientId: z.uuid(),
  /** ISO timestamp from the device */
  at: z.iso.datetime({ offset: true }).optional(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  accuracy: z.number().min(0).max(100_000).nullish(),
  locationId: z.string().max(40).nullish(),
  photoKey: z.string().max(200).nullish(),
});

export type PunchPayload = z.infer<typeof punchPayloadSchema>;

export const punchBatchSchema = z.object({ punches: z.array(punchPayloadSchema).min(1).max(100) });
