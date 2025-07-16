// components/ui/labeled-input.tsx
import { Input } from "./input";
import { InputHTMLAttributes } from "react";

interface LabeledInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function LabeledInput({ label, ...props }: LabeledInputProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <Input {...props} />
    </div>
  );
}