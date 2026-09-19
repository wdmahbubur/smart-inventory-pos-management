// Maintained RPC type contract. Database migrations remain the schema source of truth.
import type { Store, Profile, Product, Category, Supplier, Purchase, Sale, Movement } from './domain';
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Table<T> = { Row: T; Insert: never; Update: never; Relationships: [] };
type Fn<A> = { Args: A; Returns: Json };
export type Database = { public: {
 Tables: { stores: Table<Store>; profiles: Table<Profile>; products: Table<Product>; categories: Table<Category>; suppliers: Table<Supplier>; purchases: Table<Purchase>; sales: Table<Sale>; stock_movements: Table<Movement>; inventory_balances: Table<{store_id:string;product_id:string;quantity:number;updated_at:string}> };
 Views: Record<string, never>;
 Functions: {
  create_owner_store: Fn<Record<string, never>>;
  get_workspace: Fn<Record<string, never>>;
  list_catalog: Fn<{p_kind:string;p_filters:Json}>;
  list_documents: Fn<{p_kind:string;p_filters:Json}>;
  get_entity: Fn<{p_kind:string;p_id:string}>;
  get_report: Fn<{p_kind:string;p_filters:Json;p_export:boolean}>;
  catalog_mutate: Fn<{p_kind:string;p_action:string;p_payload:Json;p_request_id:string}>;
  write_purchase: Fn<{p_payload:Json;p_request_id:string;p_receive:boolean}>;
  delete_purchase_draft: Fn<{p_id:string;p_expected_version:number;p_request_id:string}>;
  complete_sale: Fn<{p_payload:Json;p_request_id:string}>;
  get_operation_result: Fn<{p_operation:string;p_request_id:string}>;
  get_insight_context: Fn<Record<string, never>>;
  begin_insight: Fn<{p_language:string;p_provider:string;p_model:string;p_prompt_version:string;p_force:boolean;p_limit:number}>;
  finish_insight: Fn<{p_lease_id:string;p_content:Json}>;
  release_insight_lease: Fn<{p_lease_id:string}>;
  latest_insight: Fn<{p_language:string}>;
 };
 Enums: Record<string, never>; CompositeTypes: Record<string, never>;
} };
