import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabase";
import { TrendingUp, Save, Loader2, Search } from "lucide-react";
import { PeriodSelector, Period, defaultPeriod, periodToQuery, periodLabel } from "./PeriodSelector";

interface VolumeProductionModuleProps {
  user: any;
  regionCode: string;
  municipalityCode: string;
  barangays: any[];
  products: string[];
  [key: string]: any;
}

export function VolumeProductionModule({ user, regionCode, municipalityCode, barangays, products: allProducts }: VolumeProductionModuleProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod());
  const [selectedBrgyCode, setSelectedBrgyCode] = useState<string>("");
  const [farmersInBrgy, setFarmersInBrgy] = useState<any[]>([]);
  const [farmerProductionData, setFarmerProductionData] = useState<Record<string, any>>({}); // Key: farmer_id
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [brgyLandArea, setBrgyLandArea] = useState<string>("");
  const [brgyAgriArea, setBrgyAgriArea] = useState<string>("");

  const pq = periodToQuery(period);

  // 1. Fetch data when barangay or period changes
  useEffect(() => {
    if (!municipalityCode || !user?.id || !selectedBrgyCode) {
      setFarmersInBrgy([]);
      return;
    }
    
    setLoading(true);
    
    Promise.all([
      // Fetch farmers in this barangay
      supabase
        .from("regional_farmers")
        .select("*")
        .eq("user_id", user.id)
        .eq("barangay_code", selectedBrgyCode)
        .order("last_name"),
      // Fetch existing production for this period for these farmers
      supabase
        .from("regional_farmer_production")
        .select("*")
        .eq("user_id", user.id)
        .eq("barangay_code", selectedBrgyCode)
        .eq("period_type", pq.period_type)
        .eq("report_year", pq.report_year)
        .eq("report_quarter", pq.report_quarter)
        .eq("report_month", pq.report_month),
      // Fetch barangay official areas
      supabase
        .from("regional_volume_production")
        .select("land_area_ha, agri_land_area_ha")
        .eq("user_id", user.id)
        .eq("barangay_code", selectedBrgyCode)
        .eq("period_type", pq.period_type)
        .eq("report_year", pq.report_year)
        .eq("report_quarter", pq.report_quarter)
        .eq("report_month", pq.report_month)
        .single()
    ]).then(([ { data: farmers }, { data: production }, { data: brgyMeta } ]) => {
      setFarmersInBrgy(farmers || []);
      
      const prodMap: Record<string, any> = {};
      (production || []).forEach(p => {
        prodMap[p.farmer_id] = p;
      });
      setFarmerProductionData(prodMap);
      setBrgyLandArea(brgyMeta?.land_area_ha?.toString() || "");
      setBrgyAgriArea(brgyMeta?.agri_land_area_ha?.toString() || "");
      setLoading(false);
    });
  }, [municipalityCode, user?.id, selectedBrgyCode, period.type, period.year, period.quarter, period.month]);

  // Combined product list: Only show products that at least one farmer in this barangay has
  const relevantProducts = useMemo(() => {
    const set = new Set<string>();
    farmersInBrgy.forEach(f => {
      (f.crops || []).forEach((c: string) => set.add(c));
    });
    // Filter out products that are NOT in the official products list (if any)
    return allProducts.filter(p => set.has(p));
  }, [farmersInBrgy, allProducts]);

  const filteredFarmers = farmersInBrgy.filter(f => {
    const full = `${f.first_name} ${f.last_name}`.toLowerCase();
    return full.includes(searchTerm.toLowerCase()) || (f.rsbsa_no || "").toLowerCase().includes(searchTerm.toLowerCase());
  });

  const setCropVal = (farmerId: string, crop: string, val: string) => {
    const mt = val === "" ? "" : Number(val);
    setFarmerProductionData(prev => {
      const existing = prev[farmerId] || { crop_data: {} };
      const newCropData = { ...existing.crop_data, [crop]: mt };
      const newTotal = Object.values(newCropData).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      return {
        ...prev,
        [farmerId]: { ...existing, crop_data: newCropData, total_mt: newTotal }
      };
    });
  };

  const handleSave = async () => {
    if (!selectedBrgyCode) return;
    setSaving(true);

    const activeBrgy = barangays.find(b => b.code === selectedBrgyCode);
    const brgyName = activeBrgy?.name || "";

    const upsertRows = filteredFarmers.map(f => {
      const row = farmerProductionData[f.id] || { crop_data: {} };
      const total = Object.values(row.crop_data).reduce((s: number, v: any) => s + (Number(v) || 0), 0);
      return {
        user_id: user.id,
        farmer_id: f.id,
        region_code: regionCode,
        municipality_code: municipalityCode,
        barangay_code: selectedBrgyCode,
        barangay_name: brgyName,
        ...pq,
        crop_data: row.crop_data,
        total_mt: total,
        updated_at: new Date().toISOString()
      };
    });

      const { error } = await supabase
      .from("regional_farmer_production")
      .upsert(upsertRows, { onConflict: "user_id,farmer_id,period_type,report_year,report_quarter,report_month" });

    if (error) {
      alert("Error: " + error.message);
    } else {
      // Re-aggregate and update the barangay total
      await updateBarangayAggregate(selectedBrgyCode, brgyName, Number(brgyLandArea) || 0, Number(brgyAgriArea) || 0);
      alert(`Production data and Barangay areas saved!`);
    }
    setSaving(false);
  };

  const updateBarangayAggregate = async (brgyCode: string, brgyName: string, landHa: number, agriHa: number) => {
    const { data } = await supabase
      .from("regional_farmer_production")
      .select("crop_data")
      .eq("user_id", user.id)
      .eq("barangay_code", brgyCode)
      .eq("period_type", pq.period_type)
      .eq("report_year", pq.report_year)
      .eq("report_quarter", pq.report_quarter)
      .eq("report_month", pq.report_month);

    if (!data) return;

    const brgyCropData: Record<string, number> = {};
    let brgyTotalMT = 0;
    data.forEach(row => {
      const cd = row.crop_data || {};
      Object.entries(cd).forEach(([crop, val]) => {
        brgyCropData[crop] = (brgyCropData[crop] || 0) + (Number(val) || 0);
        brgyTotalMT += (Number(val) || 0);
      });
    });

    await supabase.from("regional_volume_production").upsert({
      user_id: user.id,
      region_code: regionCode,
      municipality_code: municipalityCode,
      barangay_code: brgyCode,
      barangay_name: brgyName,
      ...pq,
      land_area_ha: landHa,
      agri_land_area_ha: agriHa,
      crop_data: brgyCropData,
      total_mt: brgyTotalMT,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,barangay_code,period_type,report_year,report_quarter,report_month" });
  };

  const thStyle: React.CSSProperties = {
    padding: "10px", color: "#4ade80", fontSize: 11,
    fontWeight: 700, whiteSpace: "nowrap", textAlign: "center",
    borderLeft: "1px solid rgba(255,255,255,0.1)"
  };

  // Aggregates for footer
  const totalFarmerLand = filteredFarmers.reduce((s, f) => s + (Number(f.land_area) || 0), 0);
  const totalFarmerAgri = filteredFarmers.reduce((s, f) => s + (Number(f.agricultural_land_area) || 0), 0);
  
  const currentBrgyName = barangays.find(b => b.code === selectedBrgyCode)?.name || "Selected Barangay";

  return (
    <div style={{ padding: 32 }}>
      {/* Top Selectors with Save Button */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, alignItems: "flex-end" }}>
        <div style={{ flex: 1.5 }}>
          <PeriodSelector value={period} onChange={setPeriod} label="1. Select Period">
            <button onClick={handleSave} disabled={saving || loading || !selectedBrgyCode}
              style={{ 
                height: 40, padding: "0 24px", background: "linear-gradient(135deg,#22c55e,#16a34a)", 
                color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", 
                display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontFamily: "inherit", 
                boxShadow: "0 4px 12px rgba(34,197,94,0.3)", opacity: saving || loading || !selectedBrgyCode ? 0.7 : 1 
              }}>
              {saving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Save size={16} /> Save Data</>}
            </button>
          </PeriodSelector>
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: 8 }}>2. Select Barangay</label>
          <select 
            value={selectedBrgyCode} 
            onChange={e => setSelectedBrgyCode(e.target.value)}
            style={{ width: "100%", height: 40, padding: "0 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit", background: "#fff", cursor: "pointer" }}
          >
            <option value="">-- Choose Barangay --</option>
            {barangays.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
           <label style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "1px", display: "block", marginBottom: 8 }}>3. Search Farmer</label>
           <div style={{ position: "relative" }}>
             <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
             <input 
               value={searchTerm} 
               onChange={e => setSearchTerm(e.target.value)}
               placeholder="Name or RSBSA..." 
               style={{ width: "100%", height: 40, paddingLeft: 34, border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, outline: "none", fontFamily: "inherit" }}
             />
           </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9ca3af", background: "#fff", borderRadius: 16 }}>
          <Loader2 className="animate-spin" size={32} style={{ margin: "0 auto 12px" }} />
          <p>Loading farmers and data...</p>
        </div>
      ) : !selectedBrgyCode ? (
        <div style={{ textAlign: "center", padding: 64, color: "#9ca3af", background: "rgba(255,255,255,0.5)", borderRadius: 16, border: "2px dashed #e5e7eb" }}>
          <TrendingUp size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
          <p style={{ fontWeight: 500 }}>Please select a barangay to start entering data</p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1px solid #f0f0f0" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1a2e1a" }}>
                  <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: "#1a2e1a", zIndex: 10, paddingLeft: 16, borderLeft: "none" }}>
                    Name / Barangay
                  </th>
                  <th style={thStyle}>Land Area (Ha)</th>
                  <th style={thStyle}>Agri Area (Ha)</th>
                  {relevantProducts.map(p => (
                    <th key={p} style={thStyle}>{p} (MT)</th>
                  ))}
                  <th style={{ ...thStyle, background: "#0f1f0f" }}>TOTAL (MT)</th>
                </tr>
              </thead>
              <tbody>
                {/* Barangay Summary Row */}
                {selectedBrgyCode && (
                  <tr style={{ background: "#f0fdf4", borderBottom: "2px solid #dcfce7" }}>
                    <td style={{ padding: "12px 16px", fontWeight: 800, color: "#16a34a", position: "sticky", left: 0, background: "#f0fdf4", zIndex: 5 }}>
                      {currentBrgyName}
                    </td>
                    <td style={{ padding: 0, height: 40, borderRight: "1px solid #dcfce7" }}>
                       <input 
                         value={brgyLandArea} 
                         onChange={e => setBrgyLandArea(e.target.value)}
                         placeholder="0.00" 
                         style={{ width: "100%", height: "100%", background: "transparent", border: "none", textAlign: "right", paddingRight: 10, color: "#16a34a", fontWeight: 800, fontSize: 13, outline: "none" }}
                       />
                    </td>
                    <td style={{ padding: 0, height: 40, borderRight: "1px solid #dcfce7" }}>
                       <input 
                         value={brgyAgriArea} 
                         onChange={e => setBrgyAgriArea(e.target.value)}
                         placeholder="0.00" 
                         style={{ width: "100%", height: "100%", background: "transparent", border: "none", textAlign: "right", paddingRight: 10, color: "#16a34a", fontWeight: 800, fontSize: 13, outline: "none" }}
                       />
                    </td>
                    {relevantProducts.map(p => <td key={p} style={{ textAlign: "center", color: "#d1d5db" }}>—</td>)}
                    <td style={{ textAlign: "center", color: "#d1d5db" }}>—</td>
                  </tr>
                )}

                {filteredFarmers.length === 0 ? (
                  <tr>
                    <td colSpan={6 + relevantProducts.length} style={{ padding: 48, textAlign: "center", color: "#9ca3af" }}>
                      No farmers matching filter in this barangay.
                    </td>
                  </tr>
                ) : (
                  filteredFarmers.map((farmer, i) => {
                    const rowData = farmerProductionData[farmer.id] || { crop_data: {} };
                    const cropData = rowData.crop_data || {};
                    const total = Number(rowData.total_mt) || 0;
                    const farmerCrops = new Set(farmer.crops || []);
                    const bg = i % 2 === 0 ? "#fff" : "#fbfdfb";
                    
                    return (
                      <tr key={farmer.id} style={{ background: bg, borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 16px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", position: "sticky", left: 0, background: bg, zIndex: 2, borderRight: "1px solid #f0f0f0" }}>
                          {farmer.last_name}, {farmer.first_name}
                        </td>
                        <td style={{ padding: "6px 10px", color: "#6b7280", textAlign: "right" }}>
                           {Number(farmer.land_area || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: "6px 10px", color: "#6b7280", textAlign: "right" }}>
                           {Number(farmer.agricultural_land_area || 0).toFixed(2)}
                        </td>
                        {relevantProducts.map(p => {
                          const isAuthorized = farmerCrops.has(p);
                          return (
                            <td key={p} style={{ padding: "6px 10px", textAlign: "center" }}>
                              {isAuthorized ? (
                                <input 
                                  type="number" step="0.01" 
                                  style={{ width: 70, height: 28, border: "1px solid #e5e7eb", borderRadius: 4, textAlign: "right", fontSize: 12, padding: "0 4px" }} 
                                  value={cropData[p] ?? ""} 
                                  onChange={e => setCropVal(farmer.id, p, e.target.value)} 
                                />
                              ) : (
                                <span style={{ color: "#d1d5db", fontSize: 11 }}>—</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "10px 16px", fontWeight: 700, color: "#16a34a", textAlign: "right", whiteSpace: "nowrap", background: i % 2 === 0 ? "#f0fdf4" : "#ecfdf5" }}>
                          {total.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
                )}
                
                {/* Footer Totals */}
                {filteredFarmers.length > 0 && selectedBrgyCode && (
                  <tr style={{ background: "#1a2e1a", position: "sticky", bottom: 0, height: 44 }}>
                    <td style={{ padding: "0 16px", color: "#4ade80", fontWeight: 800, fontSize: 13, position: "sticky", left: 0, background: "#1a2e1a" }}>TOTAL FROM FARMERS</td>
                    <td style={{ padding: "0 10px", color: "#4ade80", fontWeight: 800, textAlign: "right" }}>
                      {totalFarmerLand.toFixed(2)}
                    </td>
                    <td style={{ padding: "0 10px", color: "#4ade80", fontWeight: 800, textAlign: "right" }}>
                      {totalFarmerAgri.toFixed(2)}
                    </td>
                    {relevantProducts.map(p => {
                      const sum = filteredFarmers.reduce((s, f) => {
                        const row = farmerProductionData[f.id] || { crop_data: {} };
                        return s + (Number(row.crop_data[p]) || 0);
                      }, 0);
                      return <td key={p} style={{ padding: "0 10px", color: "#4ade80", fontWeight: 800, textAlign: "right" }}>{sum.toFixed(2)}</td>;
                    })}
                    <td style={{ padding: "0 16px", color: "#4ade80", fontWeight: 800, textAlign: "right", background: "#0f1f0f" }}>
                      {filteredFarmers.reduce((s, f) => s + (Number((farmerProductionData[f.id] || {}).total_mt) || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
