// Bulk Upload Feature exports
export { BulkUploadService } from './bulkUploadService.js';
export { parseCSV, processCSVForBulkUpload, classifyLead } from './csvProcessor.js';
export { getFixedUiSettings } from './campaignUiSettings.js';
export {
  detectFieldType,
  generateMappingPreview,
  mapCSVRowToLead,
  mapCSVRowsToLeads,
} from './utils/fieldMapper.js';
export {
  saveClientMapping,
  loadClientMapping,
  findUnmappedColumns,
} from './utils/mappingStorage.js';
export type { FieldMapping, ClientFieldMappingConfig } from './utils/mappingStorage.js';
export {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
} from './utils/uploadCheckpoint.js';
