import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const coilRegisterSchema = z.object({
    address: z.number().int().nonnegative(),
    type: z.literal("coil"),
    name: z.string().min(1),
    value: z.boolean(),
    description: z.string().optional(),
    writable: z.boolean().optional()
});

const discreteInputRegisterSchema = z.object({
    address: z.number().int().nonnegative(),
    type: z.literal("discreteInput"),
    name: z.string().min(1),
    value: z.boolean(),
    description: z.string().optional(),
    writable: z.boolean().optional()
});

const inputRegisterSchema = z.object({
    address: z.number().int().nonnegative(),
    type: z.literal("inputRegister"),
    name: z.string().min(1),
    value: z.number().int().nonnegative().max(65535),
    description: z.string().optional(),
    writable: z.boolean().optional()
});

const holdingRegisterSchema = z.object({
    address: z.number().int().nonnegative(),
    type: z.literal("holdingRegister"),
    name: z.string().min(1),
    value: z.number().int().nonnegative().max(65535),
    description: z.string().optional(),
    writable: z.boolean().optional()
});

const holdingRegisterFloatSchema = z.object({
    address: z.number().int().nonnegative(),
    type: z.literal("holdingRegisterFloat"),
    name: z.string().min(1),
    value: z.number().finite(),
    description: z.string().optional(),
    writable: z.boolean().optional()
});

const registerSchema = z.discriminatedUnion("type", [
    coilRegisterSchema,
    discreteInputRegisterSchema,
    inputRegisterSchema,
    holdingRegisterSchema,
    holdingRegisterFloatSchema
]);

const addressTableSchema = z.object({
    unitId: z.number().int().positive().optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().positive().max(65535).optional(),
    registers: z.array(registerSchema).min(1)
});
