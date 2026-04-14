export function compareEntriesByUserScoreThenAverage(a, b) {
  const sa = Number(a?.score) || 0;
  const sb = Number(b?.score) || 0;
  if (sa !== sb) return sb - sa;
  const aa = Number(a?.media?.averageScore) || 0;
  const ab = Number(b?.media?.averageScore) || 0;
  if (aa !== ab) return ab - aa;
  return (Number(b?.progress) || 0) - (Number(a?.progress) || 0);
}

