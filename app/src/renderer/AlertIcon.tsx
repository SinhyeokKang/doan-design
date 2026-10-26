import { CircleAlert } from "lucide-react";

// Errors and warnings never rely on colour alone, so each one leads with this mark.
export function AlertIcon({ size = 16 }: { size?: 16 | 20 }) {
  return <CircleAlert className="doan-alert-icon" size={size} aria-hidden="true" />;
}
