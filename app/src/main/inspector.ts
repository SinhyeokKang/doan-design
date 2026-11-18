export interface InspectRequest {
  selector: string;
  canvas: { root: string; path: string };
  seq: number;
}

export function parseInspectRequest(_value: unknown): InspectRequest | null {
  return null;
}
