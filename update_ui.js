import { readFileSync, writeFileSync } from "node:fs";
let code = readFileSync("src/app/page.tsx", "utf8");

const targetSection = code.substring(code.indexOf('<section className="mt-4'), code.lastIndexOf('</main>'));

const newSection = `
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_2.5fr]">
          {/* Sol Kolon: Sirket Listesi */}
          <article className="border border-white/20 bg-black p-3 flex flex-col h-[85vh]">
            <div className="flex items-center justify-between border-b border-white/20 pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Sirketler</h2>
              <span className="text-xs text-white/60">Seç</span>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredCompanies.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => setSelectedCompany(item)}
                  className={\`w-full border p-3 text-left transition \${
                    selectedCompany.symbol === item.symbol ? "border-white bg-white text-black" : "border-white/20 hover:border-white/50 bg-black text-white"
                  }\`}
                >
                  <p className="text-sm font-semibold">{item.symbol}</p>
                  <p className="mt-1 text-xs opacity-80">{item.name}</p>
                </button>
              ))}

              {!filteredCompanies.length ? <p className="py-6 text-center text-sm text-white/60">Sonuc bulunamadi.</p> : null}
            </div>
          </article>

          {/* Sag Kolon: Detaylar ve Haberler */}
          <div className="flex flex-col gap-4 overflow-y-auto h-[85vh] pb-4">
            {/* Ust Kisim: Analiz ve Bilgi */}
            <article className="border border-white/20 bg-black p-4">
              <h2 className="border-b border-white/20 pb-2 text-sm font-semibold flex items-center justify-between">
                <span className="uppercase tracking-[0.2em]">Sirket Bilgisi</span>
                <span className="text-white/60 text-xs">#{selectedTicker}</span>
              </h2>

              <div className="mt-4 grid md:grid-cols-2 gap-4">
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-white/60">Pazar:</span> {marketUniverse === "bist100" ? "BIST 100" : marketUniverse === "nasdaq100" ? "Nasdaq 100" : "S&P 500"}
                  </p>
                  <p>
                    <span className="text-white/60">Sirket:</span> {selectedCompany.name}
                  </p>
                  <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={loading}
                    className="mt-4 border border-white bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-black disabled:text-white/40"
                  >
                    {loading ? "Analiz yukleniyor..." : "Sirket Analizi Getir"}
                  </button>
                  {error ? <p className="mt-3 border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-white">{error}</p> : null}
                </div>

                {result && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="border border-white/20 p-2">
                      <p className="text-white/60">Fiyat</p>
                      <p className="mt-1 text-sm font-semibold">
                        {result.market.regularMarketPrice} {result.market.currency}
                      </p>
                    </div>
                    <div className="border border-white/20 p-2">
                      <p className="text-white/60">Gunluk</p>
                      <p className="mt-1 text-sm font-semibold">{result.market.dayChangePercent.toFixed(2)}%</p>
                    </div>
                    <div className="border border-white/20 p-2">
                      <p className="text-white/60">Aylik</p>
                      <p className="mt-1 text-sm font-semibold">
                        {result.market.oneMonthChangePercent === null ? "N/A" : \`\${result.market.oneMonthChangePercent.toFixed(2)}%\`}
                      </p>
                    </div>
                    <div className="border border-white/20 p-2">
                      <p className="text-white/60">Piyasa</p>
                      <p className="mt-1 text-sm font-semibold">{result.market.marketState}</p>
                    </div>
                  </div>
                )}
              </div>

              {result && (
                <div className="mt-4 border-t border-white/20 pt-4">
                  <div className="border border-white/20 p-3 text-sm leading-6">
                    <p className="font-semibold uppercase tracking-[0.16em] text-white/70">Ozet Analiz</p>
                    <p className="mt-2 text-white/90">{result.analysis.summary}</p>
                  </div>
                </div>
              )}
            </article>

            {/* Ozel Sirket Haberleri */}
            <article className="border border-white/20 bg-black p-4">
               <h2 className="border-b border-white/20 pb-2 text-sm font-semibold flex items-center justify-between">
                <span className="uppercase tracking-[0.2em]">Şirket Haberleri</span>
                <span className="text-white/60 text-xs">RSS Takibi ({companySpecificRssNews.length})</span>
              </h2>
              
              <div className="mt-4">
                {companySpecificRssNews.length > 0 ? (
                  <ul className="space-y-3">
                    {companySpecificRssNews.slice(0, 15).map((item, idx) => (
                       <li key={\`\${item.link}-\${idx}\`} className="border border-white/10 p-3 hover:border-white/30 transition">
                        <div className="flex items-center justify-between gap-4">
                           <a href={item.link} target="_blank" rel="noreferrer" className="text-sm font-medium hover:underline decoration-white/40 underline-offset-2 break-words">
                            {item.title}
                          </a>
                          <span className="shrink-0 text-[10px] text-white/50 bg-white/5 border border-white/10 px-2 py-1 uppercase">{item.source || item.feedName}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-white/40">
                          {Number.isNaN(Date.parse(item.pubDate)) ? item.pubDate : new Date(item.pubDate).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-white/60 border border-white/10 p-4 text-center">Bu şirket ile eşleşen güncel RSS haberi bulunamadı.</p>
                )}
              </div>
            </article>

            {/* Genel RSS ve Ayarlar */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Genel RSS Haber Akisi */}
              <article className="border border-white/20 bg-black p-4 h-[500px] flex flex-col">
                <h2 className="border-b border-white/20 pb-2 text-sm font-semibold uppercase tracking-[0.2em]">Genel Haber Akışı</h2>
                <div className="mt-3 flex-1 overflow-y-auto border border-white/20">
                  <table className="min-w-full border-collapse text-xs">
                    <thead className="border-b border-white/20 sticky top-0 bg-black">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold w-1/4">Tarih / Kaynak</th>
                        <th className="px-3 py-2 text-left font-semibold">Baslik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rssNewsRows.length ? (
                        rssNewsRows.slice(0, 50).map((item, idx) => (
                          <tr key={\`\${item.feedUrl}-\${item.link}-\${idx}\`} className="border-b border-white/10 hover:bg-white/5">
                            <td className="px-3 py-3 align-top">
                               <p className="text-white/50 text-[10px]">
                                {Number.isNaN(Date.parse(item.pubDate)) ? item.pubDate : new Date(item.pubDate).toLocaleString()}
                               </p>
                               <p className="mt-1 text-white/80 font-medium">
                                {item.source || item.feedName}
                               </p>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <a href={item.link} target="_blank" rel="noreferrer" className="text-[13px] hover:underline decoration-white/40 underline-offset-2">
                                {item.title}
                              </a>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-2 py-6 text-center text-white/60" colSpan={2}>
                            Haber bulunamadi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

               {/* Ayarlar & RSS Yönetimi */}
               <article className="border border-white/20 bg-black p-4 h-[500px] flex flex-col">
                 <h2 className="border-b border-white/20 pb-2 text-sm font-semibold uppercase tracking-[0.2em]">RSS Ayarları</h2>
                 
                 <div className="mt-4 border border-white/20 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Kaynak Ekle</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={rssInput}
                      onChange={(event) => setRssInput(event.target.value)}
                      placeholder="https://ornek.com/rss"
                      className="w-full border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white"
                    />
                    <button type="button" onClick={addRssFeed} className="border border-white bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90">
                      Ekle
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                  {rssFeeds.map((feed) => (
                    <div key={feed.url} className="border border-white/20 p-3 text-xs flex flex-col justify-between">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[13px]">{feed.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="border border-white/30 px-2 py-1 text-[9px] uppercase">{feed.language}</span>
                          {!feed.system ? (
                            <button type="button" onClick={() => removeRssFeed(feed.url)} className="border border-white/40 px-2 py-1 text-[10px] hover:bg-white hover:text-black transition">
                              Sil
                            </button>
                          ) : (
                            <span className="border border-white/30 px-2 py-1 text-[9px] uppercase text-white/50">Sistem</span>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 break-all text-white/50 text-[10px]">{feed.url}</p>
                      
                      <div className="mt-3 flex items-center justify-between">
                         <p className="text-[10px] text-white/40">Durum: {rssLoadingByFeed[feed.url] ? "Yükleniyor..." : "Hazır"}</p>
                         <button type="button" onClick={() => loadRssPreview(feed.url)} className="border border-white/40 px-3 py-1.5 text-[10px] uppercase hover:bg-white/10 transition">
                            Güncelle
                          </button>
                      </div>
                      {rssErrorByFeed[feed.url] ? <p className="mt-2 text-[11px] text-red-400">{rssErrorByFeed[feed.url]}</p> : null}
                    </div>
                  ))}
                </div>
               </article>
            </div>
            
          </div>
        </div>
`;

code = code.replace(targetSection, newSection);
writeFileSync("src/app/page.tsx", code);
