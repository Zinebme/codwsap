/** Column-mapping field definitions. Pure data — safe to import from client components. */

export type ColumnMapping = Partial<
  Record<
    | "order_id"
    | "order_date"
    | "quantity"
    | "product_name"
    | "variant"
    | "full_name"
    | "phone"
    | "wilaya"
    | "commune"
    | "delivery_place"
    | "delivery_price"
    | "products_price"
    | "total_price"
    | "tracking",
    string
  >
>;

export const MAPPABLE_FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "order_id", label: "ID commande" },
  { key: "order_date", label: "Date de commande" },
  { key: "full_name", label: "Nom complet", required: true },
  { key: "phone", label: "Téléphone", required: true },
  { key: "wilaya", label: "Wilaya" },
  { key: "commune", label: "Commune" },
  { key: "delivery_place", label: "Lieu de livraison (domicile/bureau)" },
  { key: "product_name", label: "Produit" },
  { key: "variant", label: "Variantes" },
  { key: "quantity", label: "Quantité" },
  { key: "products_price", label: "Prix produits" },
  { key: "delivery_price", label: "Prix livraison" },
  { key: "total_price", label: "Prix total" },
  { key: "tracking", label: "Numéro de suivi" },
];
