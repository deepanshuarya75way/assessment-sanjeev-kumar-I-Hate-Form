import { FieldDescriptor, FieldMapping, FieldError } from "@internship-copilot/types";

export interface ExtensionMessage<T = unknown> {
  type:
    | "PING"
    | "SCAN_FORM"
    | "SCAN_RESULT"
    | "FILL_FIELDS"
    | "FILL_RESULT"
    | "UPLOAD_RESUME"
    | "GET_SESSION_STATE"
    | "SET_SESSION_STATE"
    | "OPEN_SIDEPANEL";
  payload?: T;
}

export interface ScanResultPayload {
  frameId: number;
  fields: FieldDescriptor[];
}

export interface FillFieldsPayload {
  mappings: FieldMapping[];
  showCursor?: boolean;
  sessionId?: string;
}

export interface FillResultPayload {
  filledFieldIds: string[];
  skippedFieldIds: string[];
  errors: FieldError[];
}

export interface StoredSessionData {
  token: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  currentUrl: string | null;
  currentDomain: string | null;
  detectedFields: FieldDescriptor[];
  currentMappings: FieldMapping[];
}
