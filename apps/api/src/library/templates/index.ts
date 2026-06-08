import type { LibraryTemplate } from './types';
import { SALES_TEMPLATES } from './sales.templates';
import { CUSTOMER_SUCCESS_TEMPLATES } from './customer-success.templates';
import { MARKETING_TEMPLATES } from './marketing.templates';
import { ENGINEERING_TEMPLATES } from './engineering.templates';
import { PRODUCT_TEMPLATES } from './product.templates';
import { OPERATIONS_TEMPLATES } from './operations.templates';

export type { LibraryTemplate, LibraryWebhookConfig } from './types';

/**
 * Fixed department display order for the /library gallery. Sections render in
 * this order; the SPA hides any department with no (filtered) templates.
 */
export const LIBRARY_DEPARTMENT_ORDER: readonly string[] = [
  'Sales',
  'Marketing',
  'Customer Success',
  'Engineering',
  'Product',
  'Operations & Finance',
];

/**
 * The curated, real-world workflow templates surfaced at /v1/library/templates
 * (issue #286). This is the library's own source of truth — independent of the
 * demo-seed `DEMO_WORKFLOWS` set. Add a template to its department file and it
 * shows up here automatically.
 */
export const LIBRARY_TEMPLATES: readonly LibraryTemplate[] = [
  ...SALES_TEMPLATES,
  ...MARKETING_TEMPLATES,
  ...CUSTOMER_SUCCESS_TEMPLATES,
  ...ENGINEERING_TEMPLATES,
  ...PRODUCT_TEMPLATES,
  ...OPERATIONS_TEMPLATES,
];

export const LIBRARY_TEMPLATE_SLUGS: readonly string[] = LIBRARY_TEMPLATES.map((t) => t.slug);
