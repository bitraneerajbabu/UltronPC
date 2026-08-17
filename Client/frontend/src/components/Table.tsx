import React from 'react';

interface TableHeader {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (val: any, row: any) => React.ReactNode;
}

interface TableProps {
  headers?: TableHeader[];
  rows?: any[];
  selectable?: boolean;
  idKey?: string;
  selectedIds?: any[];
  onSelectionChange?: (ids: any[]) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  emptyMsg?: string;
}

export const Table: React.FC<TableProps> = React.memo(({
  headers = [],
  rows = [],
  selectable = true,
  idKey = 'id',
  selectedIds = [],
  onSelectionChange = () => {},
  sortKey = '',
  sortDir = 'asc',
  onSort = () => {},
  emptyMsg = 'No records found.'
}) => {
  
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = rows.map(r => r[idKey]);
      onSelectionChange(allIds);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (id, checked) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter(x => x !== id));
    }
  };

  const isAllSelected = rows.length > 0 && selectedIds.length === rows.length;

  return (
    <div className="table-wrapper">
      <table className="table">
        <thead>
          <tr>
            {selectable && (
              <th style={{ width: '36px' }}>
                <input 
                  type="checkbox" 
                  checked={isAllSelected} 
                  onChange={handleSelectAll} 
                  title="Select All" 
                />
              </th>
            )}
            {headers.map(h => {
              const isSorted = h.key === sortKey;
              const cls = isSorted ? (sortDir === 'asc' ? 'sort-asc' : 'sort-desc') : 'sort-none';
              const isSortable = h.sortable !== false;
              return (
                <th 
                  key={h.key}
                  className={isSortable ? cls : ''}
                  onClick={() => isSortable && onSort(h.key)}
                  style={{ cursor: isSortable ? 'pointer' : 'default' }}
                >
                  {h.label}
                  {isSortable && <span className="sort-icon"></span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={headers.length + (selectable ? 1 : 0)} className="table-empty">
                {emptyMsg}
              </td>
            </tr>
          ) : (
            rows.map(row => {
              const id = row[idKey];
              const isChecked = selectedIds.includes(id);
              return (
                <tr 
                  key={id} 
                  className={isChecked ? 'selected' : ''}
                  onClick={() => {
                    // Row click acts as check/select row
                    if (selectable) {
                      handleSelectRow(id, !isChecked);
                    }
                  }}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={isChecked}
                        onChange={(e) => handleSelectRow(id, e.target.checked)} 
                      />
                    </td>
                  )}
                  {headers.map(h => {
                    const val = row[h.key] ?? '';
                    return (
                      <td key={h.key} onClick={(e) => {
                        // Stop propagation if we clicked an action button or checkbox inside a cell
                        const target = e.target as HTMLElement;
                        if (target.tagName === 'BUTTON' || target.tagName === 'INPUT') {
                          e.stopPropagation();
                        }
                      }}>
                        {h.render ? h.render(val, row) : (
                          val === '—' || val === 'N/A' ? (
                            <span className="na-text">{val}</span>
                          ) : (
                            String(val)
                          )
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
});
