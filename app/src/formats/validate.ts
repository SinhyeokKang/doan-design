import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import appSocketSchema from "../../../schema/app-socket.v1.schema.json";
import appSocketV2Schema from "../../../schema/app-socket.v2.schema.json";
import appSocketV3Schema from "../../../schema/app-socket.v3.schema.json";
import appSocketV4Schema from "../../../schema/app-socket.v4.schema.json";
import commentEventSchema from "../../../schema/comment-event.v1.schema.json";
import configSchema from "../../../schema/config.v1.schema.json";
import envelopeSchema from "../../../schema/cli-envelope.v1.schema.json";
import runtimeSchema from "../../../schema/runtime.v1.schema.json";
import sessionsSchema from "../../../schema/sessions.v1.schema.json";
import type { OpenRequest, OpenResponse, WorkRequest, WorkResponse, CommentEvent, OnboardingRequest, OnboardingResponse, RuntimeFile, Selection, SocketRequest, SocketResponse } from "./types";

const ajv = new Ajv2020();

// addSchema every file before the first getSchema: app-socket $refs comment-event by its absolute $id.
for (const schema of [commentEventSchema, configSchema, envelopeSchema, runtimeSchema, appSocketSchema, appSocketV2Schema, appSocketV3Schema, appSocketV4Schema, sessionsSchema]) {
  ajv.addSchema(schema);
}

function load<T>(ref: string): ValidateFunction<T> {
  const validate = ajv.getSchema<T>(ref);
  if (!validate) throw new Error(`schema not found: ${ref}`);
  return validate;
}

const idOf = (schema: { $id: string }) => schema.$id;

export const validateCommentEvent = load<CommentEvent>(idOf(commentEventSchema));
export const validateConfig = load(idOf(configSchema));
export const validateEnvelope = load(idOf(envelopeSchema));
export const validateRuntimeFile = load<RuntimeFile>(idOf(runtimeSchema));
export const validateSocketRequest = load<SocketRequest>(`${idOf(appSocketSchema)}#/$defs/request`);
export const validateSocketResponse = load<SocketResponse>(`${idOf(appSocketSchema)}#/$defs/response`);
export const validateSelection = load<Selection>(`${idOf(appSocketSchema)}#/$defs/selection`);
export const validateOnboardingRequest = load<OnboardingRequest>(`${idOf(appSocketV2Schema)}#/$defs/request`);
export const validateOnboardingResponse = load<OnboardingResponse>(`${idOf(appSocketV2Schema)}#/$defs/response`);
export const validateWorkRequest = load<WorkRequest>(`${idOf(appSocketV3Schema)}#/$defs/request`);
export const validateWorkResponse = load<WorkResponse>(`${idOf(appSocketV3Schema)}#/$defs/response`);
export const validateOpenRequest = load<OpenRequest>(`${idOf(appSocketV4Schema)}#/$defs/request`);
export const validateOpenResponse = load<OpenResponse>(`${idOf(appSocketV4Schema)}#/$defs/response`);

export const validateSessionRecord = load(idOf(sessionsSchema));
