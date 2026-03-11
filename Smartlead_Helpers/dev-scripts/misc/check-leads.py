import urllib.request, json

API_KEY = "3baaf584-d2e4-4685-b9c5-a58839d32561_4mufyzg"
campaigns = [2905520, 2905521, 2905523, 2905522, 2905525, 2905524, 2905526]

total = 0
for cid in campaigns:
    url = f"https://server.smartlead.ai/api/v1/campaigns/{cid}/leads?api_key={API_KEY}&offset=0&limit=1"
    resp = urllib.request.urlopen(url)
    data = json.loads(resp.read())
    count = data.get("total_leads", data.get("totalCount", "?"))
    total += int(count) if isinstance(count, int) else 0
    print(f"Campaign {cid}: {count} leads")

print(f"\nTotal across all campaigns: {total}")
