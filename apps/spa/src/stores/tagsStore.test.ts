import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Tag } from '@tietide/shared';

vi.mock('@/api/tags', () => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  updateTag: vi.fn(),
  deleteTag: vi.fn(),
}));

import * as tagsApi from '@/api/tags';
import { useTagsStore } from './tagsStore';

const mockedList = vi.mocked(tagsApi.listTags);
const mockedCreate = vi.mocked(tagsApi.createTag);
const mockedUpdate = vi.mocked(tagsApi.updateTag);
const mockedDelete = vi.mocked(tagsApi.deleteTag);

const makeTag = (overrides: Partial<Tag> = {}): Tag => ({
  id: 't-1',
  name: 'tag',
  color: null,
  createdAt: new Date('2026-05-08T00:00:00Z'),
  ...overrides,
});

const resetStore = (): void => {
  useTagsStore.setState({ tags: [], status: 'idle', error: null });
};

describe('tagsStore', () => {
  beforeEach(() => {
    resetStore();
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedDelete.mockReset();
  });

  it('loads tags on fetch success', async () => {
    mockedList.mockResolvedValueOnce([makeTag({ id: 'a' })]);
    await useTagsStore.getState().fetch();
    expect(useTagsStore.getState().tags).toHaveLength(1);
    expect(useTagsStore.getState().status).toBe('ready');
  });

  it('records error on fetch failure', async () => {
    mockedList.mockRejectedValueOnce(new Error('nope'));
    await useTagsStore.getState().fetch();
    expect(useTagsStore.getState().status).toBe('error');
    expect(useTagsStore.getState().error).toBe('nope');
  });

  it('appends and sorts tags by name on create', async () => {
    useTagsStore.setState({ tags: [makeTag({ id: 'm', name: 'middle' })] });
    mockedCreate.mockResolvedValueOnce(makeTag({ id: 'a', name: 'alpha' }));

    await useTagsStore.getState().create({ name: 'alpha' });

    const names = useTagsStore.getState().tags.map((t) => t.name);
    expect(names).toEqual(['alpha', 'middle']);
  });

  it('replaces a tag in state on update', async () => {
    useTagsStore.setState({ tags: [makeTag({ id: 'a', name: 'old' })] });
    mockedUpdate.mockResolvedValueOnce(makeTag({ id: 'a', name: 'new' }));

    await useTagsStore.getState().update('a', { name: 'new' });

    expect(useTagsStore.getState().tags[0]!.name).toBe('new');
  });

  it('removes a tag from state on delete', async () => {
    useTagsStore.setState({ tags: [makeTag({ id: 'a' }), makeTag({ id: 'b' })] });
    mockedDelete.mockResolvedValueOnce(undefined);

    await useTagsStore.getState().remove('a');

    expect(useTagsStore.getState().tags.map((t) => t.id)).toEqual(['b']);
  });
});
