/** Service-layer pagination options shared by keyset-paginated list methods. */
export interface PageRequest {
  limit?: number;
  cursor?: string;
}
