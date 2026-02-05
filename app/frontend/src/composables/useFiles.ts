import { ref } from 'vue'

const API_BASE = 'http://localhost:8000/api'
const DATA_BASE = 'http://localhost:8000/data'

export type FileType = 'png' | 'svg' | 'json' | 'other'

export interface FileInfo {
  name: string
  type: FileType
  size: number
  is_hidden: boolean
}

export function useFiles(projectId: string) {
  const files = ref<FileInfo[]>([])
  const loading = ref(false)

  const loadFiles = async () => {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/files/${projectId}`)
      if (res.ok) {
        files.value = await res.json()
      }
    } finally {
      loading.value = false
    }
  }

  const getFileUrl = (filename: string) => {
    return `${DATA_BASE}/${projectId}/${filename}`
  }

  const saveFile = async (filename: string, content: string) => {
    const res = await fetch(`${API_BASE}/files/${projectId}/${filename}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error('Failed to save file')
    await loadFiles()
  }

  const deleteFile = async (filename: string) => {
    const res = await fetch(`${API_BASE}/files/${projectId}/${filename}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('Failed to delete file')
    await loadFiles()
  }

  return {
    files,
    loading,
    loadFiles,
    getFileUrl,
    saveFile,
    deleteFile,
  }
}
