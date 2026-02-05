// Project CRUD composable: fetch, create, update, delete projects with tag-based filtering.
import { ref, computed } from 'vue'

const API_BASE = '/api'

export type Tag = 'in_progress' | 'completed' | 'discarded' | 'refs'

export const ALL_TAGS: Tag[] = ['in_progress', 'completed', 'discarded', 'refs']
export const DEFAULT_SELECTED_TAGS: Tag[] = ['in_progress']

export interface Project {
  id: string
  name: string
  tag: Tag
  created: string
  modified: string
  thumbnail: string | null
  thumbnail_mtime: number | null
}

// Global: shared across HomeView + ProjectView to avoid redundant fetches
const projects = ref<Project[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

export function useProjects() {
  const fetchProjects = async () => {
    loading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/projects`)
      if (!res.ok) throw new Error('Failed to fetch projects')
      projects.value = await res.json()
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  const createProject = async (name: string, tag: Tag = 'in_progress') => {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tag }),
    })
    if (!res.ok) throw new Error('Failed to create project')
    const project = await res.json()
    projects.value.push(project)
    return project
  }

  const updateProject = async (id: string, updates: { name?: string; tag?: Tag }) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    if (!res.ok) throw new Error('Failed to update project')
    const updated = await res.json()
    const idx = projects.value.findIndex(p => p.id === id)
    if (idx >= 0) projects.value[idx] = updated
    return updated
  }

  const deleteProject = async (id: string) => {
    const res = await fetch(`${API_BASE}/projects/${id}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete project')
    // Project is moved to discarded, so refetch
    await fetchProjects()
  }

  const getProject = async (id: string): Promise<Project> => {
    const res = await fetch(`${API_BASE}/projects/${id}`)
    if (!res.ok) throw new Error('Project not found')
    return await res.json()
  }

  const tagCounts = computed(() => {
    const counts = Object.fromEntries(ALL_TAGS.map(t => [t, 0])) as Record<Tag, number>
    for (const p of projects.value) {
      counts[p.tag]++
    }
    return counts
  })

  const filterByTags = (tags: Tag[]) => {
    if (tags.length === 0) return projects.value
    return projects.value.filter(p => tags.includes(p.tag))
  }

  return {
    projects,
    loading,
    error,
    fetchProjects,
    createProject,
    updateProject,
    deleteProject,
    getProject,
    tagCounts,
    filterByTags,
  }
}
