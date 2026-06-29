import { z } from "zod";

export const TickSchema = z.number().int().safe();

export const SampleSchema = z.number().int().safe();

export const SecondSchema = z.number().finite().safe();

export const TimeSignatureSchema = z.object({
  numerator: z.number().int().min(1).max(64),
  denominator: z
    .number()
    .int()
    .min(1)
    .max(64)
    .refine((v) => Number.isInteger(Math.log2(v)), {
      message: "time-signature denominator must be a power of two",
    }),
});

export const BarBeatTickSchema = z.object({
  bar: z.number().int().min(0),
  beat: z.number().int().min(0),
  tick: z.number().int().min(0),
});
