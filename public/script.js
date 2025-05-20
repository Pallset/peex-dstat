const ctx = document.getElementById('traffic-chart').getContext('2d');
const totalRequestEl = document.getElementById('total-request');
const rpsEl = document.getElementById('rps');
const ipCountEl = document.getElementById('ip-count');
const mostCountryEl = document.getElementById('most-country');
const whoisCountryEl = document.getElementById('whois-country');
const btnPhoto = document.getElementById('btn-photo');
const statsContainer = document.createElement('div');
statsContainer.style.position = 'absolute';
statsContainer.style.bottom = '10px';
statsContainer.style.left = '10px';
statsContainer.style.color = 'white';
statsContainer.style.fontSize = '16px';
statsContainer.style.fontWeight = 'bold';
statsContainer.style.textAlign = 'left';
statsContainer.style.userSelect = 'none';
statsContainer.style.pointerEvents = 'none';

let trafficData = {
    labels: [],
    datasets: [
        {
            label: 'Total Request',
            data: [],
            borderColor: 'red',
            fill: false,
            tension: 0.3,
        },
        {
            label: 'Request Per Second',
            data: [],
            borderColor: 'yellow',
            fill: false,
            tension: 0.3,
        },
        {
            label: 'IP Count',
            data: [],
            borderColor: 'limegreen',
            fill: false,
            tension: 0.3,
        },
        {
            label: 'Most Country',
            data: [],
            borderColor: 'white',
            fill: false,
            tension: 0.3,
        },
    ],
};

const chart = new Chart(ctx, {
    type: 'line',
    data: trafficData,
    options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
            y: { beginAtZero: true, min: 0 },
            x: { display: false },
        },
        plugins: {
            legend: { labels: { color: '#fff', font: { size: 14 } } },
            tooltip: {
                enabled: true,
                callbacks: {
                    label: (ctx) => {
                        if (ctx.dataset.label === 'Most Country') return `${ctx.dataset.label}: ${ctx.parsed.y > 0 ? mostCountryEl.textContent : 'N/A'}`;
                        return `${ctx.dataset.label}: ${ctx.parsed.y}`;
                    },
                },
            },
        },
    },
});

function formatNum(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'm';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'k';
    return num.toString();
}

async function fetchStats() {
    try {
        const res = await fetch('/stats');
        if (!res.ok) throw new Error('Failed to fetch stats');
        const data = await res.json();

        totalRequestEl.textContent = formatNum(data.total);
        rpsEl.textContent = formatNum(data.rps);
        ipCountEl.textContent = formatNum(data.ipCount);
        mostCountryEl.textContent = data.mostCountry || 'Unknown';
        whoisCountryEl.textContent = data.whoisCountry ? `(${data.whoisCountry})` : '';

        statsContainer.innerText = `Total: ${formatNum(data.total)} | IPs: ${formatNum(data.ipCount)} | RPS: ${formatNum(data.rps)} | Country: ${data.mostCountry || 'Unknown'}`;

        if (trafficData.labels.length >= 40) {
            trafficData.labels.shift();
            trafficData.datasets.forEach(ds => ds.data.shift());
        }
        const timestamp = new Date().toLocaleTimeString();
        trafficData.labels.push(timestamp);
        trafficData.datasets[0].data.push(data.total);
        trafficData.datasets[1].data.push(data.rps);
        trafficData.datasets[2].data.push(data.ipCount);
        trafficData.datasets[3].data.push(data.mostCountry && data.mostCountry !== 'Unknown' ? 1 : 0);

        chart.update();
    } catch (err) {
        console.error('Error fetching stats:', err);
    }
}

setInterval(fetchStats, 1000);
fetchStats();

btnPhoto.addEventListener('click', async () => {
    const container = document.getElementById('traffic-container');
    try {
        const canvas = await html2canvas(container, { backgroundColor: null });
        const imgData = canvas.toDataURL('image/png');

        const popup = document.createElement('div');
        popup.id = 'photo-popup';
        popup.style = `
            position: fixed; top:0; left:0; right:0; bottom:0; 
            background: rgba(0,0,0,0.8); display:flex; justify-content:center; align-items:center; z-index:9999;
            cursor: pointer;
        `;
        const imgWrapper = document.createElement('div');
        imgWrapper.style = 'position: relative; max-width: 90vw; max-height: 90vh; border-radius: 10px; overflow: hidden;';

        const img = new Image();
        img.src = imgData;
        img.style = 'width: 100%; height: auto; display: block;';
        imgWrapper.appendChild(img);

        const watermark = document.createElement('div');
        watermark.innerText = 'PeeX - Dstat';
        watermark.style = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-25deg);
            font-size: 96px; color: rgba(255,255,255,0.15);
            user-select:none; pointer-events:none; font-weight: 900; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            text-transform: uppercase;
            letter-spacing: 4px;
        `;
        imgWrapper.appendChild(watermark);
        imgWrapper.appendChild(statsContainer);

        popup.appendChild(imgWrapper);
        popup.onclick = () => document.body.removeChild(popup);
        document.body.appendChild(popup);
    } catch (e) {
        alert('Failed to take screenshot: ' + e.message);
    }
});

function adjustTrafficBox() {
    const box = document.getElementById('traffic-container');
    const dpi = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    if (width <= 480) {
        box.style.width = `${Math.min(360, width - 40)}px`;
        box.style.height = `${240 / dpi}px`;
    } else if (width <= 768) {
        box.style.width = `${Math.min(600, width - 40)}px`;
        box.style.height = '280px';
    } else {
        box.style.width = '900px';
        box.style.height = '320px';
    }
}

window.addEventListener('resize', adjustTrafficBox);
window.addEventListener('load', () => {
    adjustTrafficBox();
    fetchStats();
});