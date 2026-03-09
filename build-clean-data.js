const fs = require("fs");
const path = require("path");

const INPUT_FILE = path.join(__dirname, "data.json");
const OVERRIDES_FILE = path.join(__dirname, "overrides.json");
const OUTPUT_FILE = path.join(__dirname, "data.cleaned.json");
const REPORT_FILE = path.join(__dirname, "build-report.json");

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeAddress(value) {
  return normalizeText(value)
    .replace(/–/g, "-")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,+$/g, "");
}

function normalizeOverrideKey(key) {
  const [community = "", ...rest] = String(key || "").split("|");
  const address = rest.join("|");
  return address
    ? `${normalizeText(community)}|${normalizeAddress(address)}`
    : normalizeText(community);
}

function extractCodes(raw) {
  const matches = String(raw || "").match(/\d+/g) || [];
  const seen = new Set();
  const out = [];

  for (const code of matches) {
    if (!seen.has(code)) {
      seen.add(code);
      out.push(code);
    }
  }

  return out;
}

function mergeCodes(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    for (const code of extractCodes(value)) {
      if (!seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
    }
  }

  return out.join(", ");
}

function sortObjectKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = obj[key];
  }
  return sorted;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function pickRepresentativeAddress(addresses, manualAddress) {
  if (manualAddress) return normalizeAddress(manualAddress);

  for (const address of addresses) {
    const clean = normalizeAddress(address);
    if (clean) return clean;
  }

  return "";
}

function normalizeOverrideMap(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    out[normalizeOverrideKey(key)] = value;
  }
  return out;
}

function buildCleanData(raw, overrides) {
  const groups = raw.groups || {};

  const out = {
    meta: {
      source_rows: raw.meta?.total_rows_after_cleaning || 0,
      source_communities: raw.meta?.unique_communities || 0,
      generated_at: new Date().toISOString(),
      notes: [
        "One entry per community",
        "All codes preserved and merged per community",
        "One representative address per community",
        "Grouped by property type for UI rendering",
        "Supports community-only and community+address code overrides"
      ]
    },
    Apartments: {},
    Residential: {},
    "Student Housing": {}
  };

  const renameCommunity = overrides.renameCommunity || {};
  const typeByCommunity = overrides.communityType || {};
  const typeByAddress = overrides.addressType || {};
  const manualCommunityAddress = overrides.addresses || {};
  const addressReplacements = normalizeOverrideMap(overrides.addressReplacements || {});
  const codeOverrides = normalizeOverrideMap(overrides.codes || {});

  const report = {
    generated_at: new Date().toISOString(),
    unmatched_code_overrides: [],
    communities_without_codes: [],
    communities_with_multiple_addresses: [],
    resolved_code_override_hits: []
  };

  const grouped = new Map();
  const matchedOverrideKeys = new Set();

  for (const [rawCommunityName, entries] of Object.entries(groups)) {
    const communityName = renameCommunity[rawCommunityName] || rawCommunityName;
    const cleanCommunity = normalizeText(communityName);

    for (const entry of entries || []) {
      let address = normalizeAddress(entry.address || "");
      const replacementKey = normalizeOverrideKey(`${cleanCommunity}|${address}`);

      if (addressReplacements[replacementKey]) {
        address = normalizeAddress(addressReplacements[replacementKey]);
      }

      const resolvedType =
        typeByAddress[address] ||
        typeByCommunity[cleanCommunity] ||
        normalizeText(entry.type) ||
        "Residential";

      const type = out[resolvedType] ? resolvedType : "Residential";
      const bucketKey = `${type}|${cleanCommunity}`;

      if (!grouped.has(bucketKey)) {
        grouped.set(bucketKey, {
          type,
          community: cleanCommunity,
          addresses: [],
          rawCodes: []
        });
      }

      const bucket = grouped.get(bucketKey);

      if (address) {
        bucket.addresses.push(address);
      }

      const exactCodeKey = normalizeOverrideKey(`${cleanCommunity}|${address}`);
      const communityOnlyCodeKey = normalizeText(cleanCommunity);
      const hasExactOverride = Object.prototype.hasOwnProperty.call(codeOverrides, exactCodeKey);
      const hasCommunityOverride = Object.prototype.hasOwnProperty.call(codeOverrides, communityOnlyCodeKey);

      const finalCodeSource = hasExactOverride
        ? codeOverrides[exactCodeKey]
        : hasCommunityOverride
        ? codeOverrides[communityOnlyCodeKey]
        : entry.gate ?? "";

      if (hasExactOverride) {
        matchedOverrideKeys.add(exactCodeKey);
        report.resolved_code_override_hits.push({ community: cleanCommunity, address, match_type: "exact", key: exactCodeKey });
      } else if (hasCommunityOverride) {
        matchedOverrideKeys.add(communityOnlyCodeKey);
        report.resolved_code_override_hits.push({ community: cleanCommunity, address, match_type: "community", key: communityOnlyCodeKey });
      }

      bucket.rawCodes.push(finalCodeSource);
    }
  }

  let cleanedCommunities = 0;
  let cleanedEntries = 0;
  let cleanedCodes = 0;
  let missingAddresses = 0;

  for (const [, bucket] of grouped) {
    const manualAddress = manualCommunityAddress[bucket.community] || "";
    const representativeAddress = pickRepresentativeAddress(bucket.addresses, manualAddress);
    const mergedGate = mergeCodes(bucket.rawCodes);
    const distinctAddresses = [...new Set(bucket.addresses.filter(Boolean))];

    out[bucket.type][bucket.community] = [
      {
        address: representativeAddress,
        gate: mergedGate,
        type: bucket.type
      }
    ];

    cleanedCommunities += 1;
    cleanedEntries += 1;
    cleanedCodes += extractCodes(mergedGate).length;

    if (!representativeAddress) {
      missingAddresses += 1;
    }

    if (!mergedGate) {
      report.communities_without_codes.push(bucket.community);
    }

    if (distinctAddresses.length > 1) {
      report.communities_with_multiple_addresses.push({
        community: bucket.community,
        displayed_address: representativeAddress,
        merged_addresses: distinctAddresses
      });
    }
  }

  for (const key of Object.keys(codeOverrides)) {
    if (!matchedOverrideKeys.has(key)) {
      report.unmatched_code_overrides.push(key);
    }
  }

  out.Apartments = sortObjectKeys(out.Apartments);
  out.Residential = sortObjectKeys(out.Residential);
  out["Student Housing"] = sortObjectKeys(out["Student Housing"]);

  out.meta.cleaned_communities = cleanedCommunities;
  out.meta.cleaned_entries = cleanedEntries;
  out.meta.cleaned_codes = cleanedCodes;
  out.meta.missing_addresses = missingAddresses;
  out.meta.section_counts = {
    Apartments: Object.keys(out.Apartments).length,
    Residential: Object.keys(out.Residential).length,
    "Student Housing": Object.keys(out["Student Housing"]).length
  };
  out.meta.report_file = path.basename(REPORT_FILE);

  return { cleaned: out, report };
}

function main() {
  const raw = readJson(INPUT_FILE);
  const overrides = readJson(OVERRIDES_FILE);
  const { cleaned, report } = buildCleanData(raw, overrides);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cleaned, null, 2), "utf8");
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`Wrote ${REPORT_FILE}`);
  console.log(`Communities: ${cleaned.meta.cleaned_communities}`);
  console.log(`Entries: ${cleaned.meta.cleaned_entries}`);
  console.log(`Codes: ${cleaned.meta.cleaned_codes}`);
  console.log(`Missing addresses: ${cleaned.meta.missing_addresses}`);
  console.log(`Apartments: ${cleaned.meta.section_counts.Apartments}`);
  console.log(`Residential: ${cleaned.meta.section_counts.Residential}`);
  console.log(`Student Housing: ${cleaned.meta.section_counts["Student Housing"]}`);
  console.log(`Unmatched code overrides: ${report.unmatched_code_overrides.length}`);
}

main();
