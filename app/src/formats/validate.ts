import Ajv2020 from "ajv/dist/2020";
import commentEventSchema from "../../../schema/comment-event.v1.schema.json";
import configSchema from "../../../schema/config.v1.schema.json";
import envelopeSchema from "../../../schema/cli-envelope.v1.schema.json";
import type { CommentEvent } from "./types";

const ajv = new Ajv2020();

export const validateCommentEvent = ajv.compile<CommentEvent>(commentEventSchema);
export const validateConfig = ajv.compile(configSchema);
export const validateEnvelope = ajv.compile(envelopeSchema);
