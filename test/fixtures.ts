// SYNTHETIC fixtures: bodies shaped like each provider's documented response,
// filled with invented records. They test parsing, not provider behaviour.

export const crossrefBody = JSON.stringify({
  status: "ok",
  message: {
    items: [
      {
        DOI: "10.5555/Example.Near-Miss",
        title: ["Tidal Harmonics of the Southern Delta Region"],
        author: [{ given: "Ines", family: "Marlowe" }],
        issued: { "date-parts": [[1998]] },
        URL: "https://doi.org/10.5555/example.near-miss",
      },
      {
        DOI: "10.5555/EXAMPLE.TIDES",
        title: ["Tidal <i>Harmonics</i> of the Northern Basin"],
        subtitle: [],
        author: [{ given: "Ines", family: "Marlowe" }, { given: "Tomas", family: "Okafor" }],
        issued: { "date-parts": [[1998, 5]] },
        URL: "http://dx.doi.org/10.5555/EXAMPLE.TIDES",
        ISBN: ["978-0-00-000000-2"],
      },
      { DOI: "10.5555/no-title", title: [] },
    ],
  },
});

export const openalexBody = JSON.stringify({
  results: [
    {
      id: "https://openalex.org/W0000000001",
      doi: "https://doi.org/10.5555/EXAMPLE.TIDES",
      title: "Tidal Harmonics of the Northern Basin",
      publication_year: 1998,
      authorships: [{ author: { display_name: "Ines Marlowe" } }, { author: { display_name: "Tomas Okafor" } }],
      primary_location: { landing_page_url: "https://journal.example.org/tides" },
      best_oa_location: { pdf_url: "https://repo.example.org/tides.pdf" },
    },
    {
      id: "https://openalex.org/W0000000002",
      doi: null,
      display_name: "Unsafe Link Study",
      publication_year: 2001,
      authorships: [],
      primary_location: null,
      best_oa_location: { pdf_url: "http://192.168.0.7/secret.pdf" },
    },
  ],
});

export const openlibraryBody = JSON.stringify({
  docs: [
    {
      key: "/works/OL1W",
      title: "A Field Guide to Imaginary Lighthouses",
      author_name: ["Wren Halloran"],
      first_publish_year: 1987,
      isbn: ["0-00-000000-0", "9780000000002"],
    },
    { key: "/works/OL2W" },
  ],
});

export const googlebooksBody = JSON.stringify({
  items: [
    {
      id: "gbvol1",
      volumeInfo: {
        title: "A Field Guide to Imaginary Lighthouses",
        authors: ["Wren Halloran"],
        publishedDate: "1991-03",
        industryIdentifiers: [
          { type: "ISBN_10", identifier: "0000000000" },
          { type: "ISBN_13", identifier: "9780000000002" },
          { type: "OTHER", identifier: "XYZ" },
        ],
        infoLink: "https://books.example.com/vol1",
      },
    },
  ],
});

export const semanticscholarBody = JSON.stringify({
  total: 1,
  data: [
    {
      paperId: "abc123",
      title: "Sparse Lattices for Toy Routing",
      authors: [{ name: "Priya Anand" }, { name: "Jonas Weber" }],
      year: 2019,
      externalIds: { DOI: "10.5555/TOY.ROUTING", ArXiv: "1901.00001v2" },
      openAccessPdf: { url: "https://arxiv.org/pdf/1901.00001" },
      url: "https://www.semanticscholar.org/paper/abc123",
    },
  ],
});

export const arxivBody = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <title>search results</title>
  <entry>
    <id>http://arxiv.org/abs/1901.00001v2</id>
    <published>2019-01-02T10:00:00Z</published>
    <title>Sparse Lattices
      for Toy Routing &amp; Friends</title>
    <author><name>Priya Anand</name></author>
    <author><name>Jonas Weber</name></author>
    <arxiv:doi>10.5555/TOY.ROUTING</arxiv:doi>
    <link title="pdf" href="http://arxiv.org/pdf/1901.00001v2" rel="related" type="application/pdf"/>
  </entry>
</feed>`;

/** A fetch stub that serves bodies by URL substring and records the URLs it saw. */
export function stubFetch(routes: Record<string, string | (() => Response)>) {
  const calls: string[] = [];
  const fn = (async (input: any) => {
    const url = String(input);
    calls.push(url);
    for (const [frag, body] of Object.entries(routes)) {
      if (url.includes(frag)) return typeof body === "function" ? body() : new Response(body, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}
