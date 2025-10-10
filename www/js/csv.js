// js/csv.js
(function(HL){
  HL.csv = HL.csv || {};

  HL.csv.parseCSV = function parseCSV(csvText, maxRows = Infinity) {
    if (!csvText || !csvText.trim()) return [];

    let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
    const firstLine = text.split('\n', 1)[0] || '';
    let sep = ',';
    const semis = (firstLine.match(/;/g) || []).length;
    const comms = (firstLine.match(/,/g) || []).length;
    if (semis > comms && semis > 0) sep = ';';

    const parseLine = (line) => {
      const fields = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
          } else cur += ch;
        } else {
          if (ch === '"') inQuotes = true;
          else if (ch === sep) { fields.push(cur); cur = ''; }
          else cur += ch;
        }
      }
      fields.push(cur);
      return fields.map(f => f.trim());
    };

    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length === 0) return [];

    const headerRow = parseLine(lines[0]);
    const headers = headerRow.map(h => h.replace(/^"|"$/g,'').trim().toLowerCase());

    const out = [];
    let csvCounter = 0;
    for (let i = 1; i < lines.length; i++) {
      if (csvCounter >= maxRows) break;
      const cols = parseLine(lines[i]);
      if (cols.every(c => c === '')) continue;
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j] || `col${j}`;
        obj[key] = cols[j] !== undefined ? cols[j] : '';
      }

      // convertir corchetes a lista donde aplique
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string' && obj[k].trim().startsWith('[') && obj[k].trim().endsWith(']')) {
          const s = obj[k].trim();
          try {
            obj[k] = JSON.parse(s.replace(/'/g, '"'));
          } catch (e) {
            const inner = s.slice(1, -1);
            obj[k] = inner.split(',').map(x => x.replace(/^["']|["']$/g,'').trim()).filter(Boolean);
          }
        }
      }

      // mapear a campos de la app (flexible)
      const mapped = {};
      mapped.family = obj['family'] || '';
      mapped.genus = obj['genus'] || '';
      mapped.species = obj['species'] || '';
      mapped.scientific_name = obj['scientificname'] || obj['scientific_name'] || obj['scientific'] || ((mapped.genus || '') + ' ' + (mapped.species || '')).trim();
      mapped.common_name = obj['commonname'] || obj['common_name'] || obj['common'] || obj['common name'] || '';
      mapped.growth_rate = obj['growthrate'] || obj['growth_rate'] || obj['growth rate'] || '';
      mapped.hardiness_zones = obj['hardinesszones'] || obj['hardiness_zones'] || '';
      mapped.height = obj['height'] || '';
      mapped.width = obj['width'] || '';
      mapped.type = obj['type'] || '';
      mapped.foliage = obj['foliage'] || '';
      mapped.pollinators = Array.isArray(obj['pollinators']) ? obj['pollinators'] : (obj['pollinators'] ? [obj['pollinators']] : []);
      mapped.leaf = obj['leaf'] || '';
      mapped.flower = obj['flower'] || '';
      mapped.ripen = obj['ripen'] || '';
      mapped.reproduction = obj['reproduction'] || '';
      mapped.soils = Array.isArray(obj['soils']) ? obj['soils'] : (obj['soils'] || '');
      mapped.pH = obj['p_h'] || obj['ph'] || obj['pH'] || '';
      mapped.pH_split = obj['p_h_split'] || '';
      mapped.preferences = obj['preferences'] || '';
      mapped.tolerances = obj['tolerances'] || '';
      mapped.habitat = obj['habitat'] || '';
      mapped.habitat_range = obj['habitatrange'] || obj['habitat_range'] || '';
      mapped.edibility = obj['edibility'] || '';
      mapped.medicinal = obj['medicinal'] || obj['medicinal_uses'] || obj['usos'] || '';
      mapped.other_uses = obj['otheruses'] || obj['other_uses'] || '';
      mapped.pfaf = obj['pfaf'] || '';
      mapped.image_url = obj['image url'] || obj['image_url'] || obj['image'] || obj['imagen'] || '';
      mapped.images = mapped.image_url ? [mapped.image_url] : [];
      mapped.description = obj['description'] || '';

      if ((mapped.common_name && mapped.common_name.trim() !== '') || (mapped.scientific_name && mapped.scientific_name.trim() !== '')) {
        csvCounter++;
        mapped.csv_counter = csvCounter;
        mapped.source = 'csv';
        out.push(mapped);
        if (csvCounter >= maxRows) break;
      }
    }

    return out;
  };

})(window.HerboLive);
