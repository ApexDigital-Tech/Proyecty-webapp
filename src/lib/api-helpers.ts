import { PaginatedResponse, PaginationInfo } from '../types.ts';

/**
 * Normaliza defensivamente cualquier respuesta de API que deba contener una lista paginada.
 * Maneja de forma transparente:
 * 1. Respuestas paginadas estándar: { data: T[], pagination: { totalItems, currentPage, totalPages, limit } }
 * 2. Respuestas como arreglo directo: T[]
 * 3. Respuestas envoltorio alternativo: { projects: T[] }, { items: T[] }
 * 4. Respuestas vacías, nulas o errores: { data: [] }
 */
export function normalizePaginatedResponse<T>(response: unknown): { data: T[]; pagination: PaginationInfo } {
  const defaultPagination: PaginationInfo = {
    totalItems: 0,
    currentPage: 1,
    totalPages: 1,
    limit: 10,
  };

  if (!response || typeof response !== 'object') {
    return { data: [], pagination: defaultPagination };
  }

  // 1. Extracción y validación estricta del arreglo de datos
  let items: T[] = [];
  const resObj = response as Record<string, any>;

  if (Array.isArray(response)) {
    items = response;
  } else if (Array.isArray(resObj.data)) {
    items = resObj.data;
  } else if (Array.isArray(resObj.projects)) {
    items = resObj.projects;
  } else if (Array.isArray(resObj.items)) {
    items = resObj.items;
  } else {
    items = [];
  }

  // 2. Extracción y validación estricta de la paginación
  const rawPag = resObj.pagination;
  const totalItems = typeof rawPag?.totalItems === 'number'
    ? rawPag.totalItems
    : typeof rawPag?.total === 'number'
      ? rawPag.total
      : items.length;

  const currentPage = typeof rawPag?.currentPage === 'number'
    ? rawPag.currentPage
    : typeof rawPag?.page === 'number'
      ? rawPag.page
      : 1;

  const limit = typeof rawPag?.limit === 'number' && rawPag.limit > 0
    ? rawPag.limit
    : 10;

  const totalPages = typeof rawPag?.totalPages === 'number'
    ? rawPag.totalPages
    : Math.max(1, Math.ceil(totalItems / limit));

  const pagination: PaginationInfo = {
    totalItems: Math.max(0, totalItems),
    currentPage: Math.max(1, currentPage),
    totalPages: Math.max(1, totalPages),
    limit,
  };

  return { data: items, pagination };
}

/**
 * Normaliza defensivamente cualquier respuesta que deba ser un arreglo plano.
 * Si la respuesta viene como { data: [...] } o [...] devuelve el arreglo, caso contrario [].
 */
export function normalizeArrayResponse<T>(response: unknown): T[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  
  if (typeof response === 'object') {
    const resObj = response as Record<string, any>;
    if (Array.isArray(resObj.data)) return resObj.data;
    if (Array.isArray(resObj.items)) return resObj.items;
    if (Array.isArray(resObj.projects)) return resObj.projects;
    if (Array.isArray(resObj.tasks)) return resObj.tasks;
    if (Array.isArray(resObj.expenses)) return resObj.expenses;
    if (Array.isArray(resObj.users)) return resObj.users;
    if (Array.isArray(resObj.documents)) return resObj.documents;
  }
  
  return [];
}
