import { useEffect, useMemo, useState } from "react";
import { fetchVndbDetails, type VndbDetail } from "./catalog-api";

export function useVndbDetails(ids: number[]): Map<number, VndbDetail> {
  const key = useMemo(() => Array.from(new Set(ids)).sort((a, b) => a - b).join(","), [ids]);
  const [details, setDetails] = useState<Map<number, VndbDetail>>(new Map());

  useEffect(() => {
    if (!key) return;
    let active = true;
    void fetchVndbDetails(key.split(",").map(Number)).then((value) => {
      if (active) setDetails(value);
    }).catch(() => {
      if (active) setDetails(new Map());
    });
    return () => { active = false; };
  }, [key]);

  return key ? details : new Map();
}
