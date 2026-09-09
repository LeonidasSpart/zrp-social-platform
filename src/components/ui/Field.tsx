"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { fieldControlClasses } from "./styles";

export interface FieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> {
  label: string;
  /** Supporting text under the control. Announced with the input. */
  description?: string;
  /** Message shown when the value is rejected. Announced immediately. */
  error?: string;
  /** Pass an explicit id when something outside needs to reference it. */
  id?: string;
  containerClassName?: string;
}

/**
 * A labelled text input.
 *
 * The association is the point. Login shipped with a styled `<label>`
 * that had no `htmlFor` and an input with no `id` - three signup fields
 * had the same defect - so tapping the label focused nothing and screen
 * readers announced an unlabelled input. A label that looks right and
 * is wired to nothing is worse than no label, because it looks done.
 * Here the id is generated and wired in one place, so it cannot be
 * forgotten.
 *
 * `description` and `error` are both linked with aria-describedby, and
 * the error carries role="alert" so a rejected submit is announced
 * rather than only turning a border red.
 */
export default function Field({
  label,
  description,
  error,
  id,
  className,
  containerClassName,
  ...props
}: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", containerClassName)}>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
      </label>

      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldControlClasses(Boolean(error)), className)}
        {...props}
      />

      {description && (
        // text-gray-500 is the floor for metadata on white: gray-400
        // does not reach 4.5:1.
        <p id={descriptionId} className="text-xs text-gray-500 dark:text-gray-400">
          {description}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-red-700 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}
