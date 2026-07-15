export type OptimisticStatus = 'idle' | 'pending' | 'confirmed' | 'error'

export function optimisticUpdate<T>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  itemId: number | string,
  idField: keyof T,
  newItem: Partial<T>,
): () => void {
  let snapshot: T[] = []
  setter(prev => {
    snapshot = [...prev]
    return prev.map(item =>
      item[idField] === itemId ? { ...item, ...newItem } : item
    )
  })
  return () => setter(snapshot)
}

export function optimisticAdd<T>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  newItem: T,
): () => void {
  let snapshot: T[] = []
  setter(prev => {
    snapshot = [...prev]
    return [...prev, newItem]
  })
  return () => setter(snapshot)
}

export function optimisticRemove<T>(
  setter: React.Dispatch<React.SetStateAction<T[]>>,
  itemId: number | string,
  idField: keyof T,
): () => void {
  let snapshot: T[] = []
  let removed: T | undefined
  setter(prev => {
    snapshot = [...prev]
    removed = prev.find(item => item[idField] === itemId)
    return prev.filter(item => item[idField] !== itemId)
  })
  return () => {
    if (removed) setter(prev => [...prev, removed])
    else setter(snapshot)
  }
}
