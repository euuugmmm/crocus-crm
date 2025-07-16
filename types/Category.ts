export type Category = {
  id: string;
  name: string;
  type: "income" | "expense";
  description?: string;
};