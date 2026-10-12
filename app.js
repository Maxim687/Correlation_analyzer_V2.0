var current = null;
var savedResults = loadResults();
var showRanks = false;
var recording = false;

var names = { pearson: "Пірсона", spearman: "Спірмена", kendall: "Кендалла" };

function get(id) {
  return document.getElementById(id);
}

function average(arr) {
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

function pearson(x, y) {
  var mx = average(x),
    my = average(y);
  var top = 0,
    sx = 0,
    sy = 0;
  for (var i = 0; i < x.length; i++) {
    var dx = x[i] - mx;
    var dy = y[i] - my;
    top += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  if (sx == 0 || sy == 0) return 0;
  return top / Math.sqrt(sx * sy);
}

function getRanks(values) {
  var order = [];
  for (var i = 0; i < values.length; i++) order.push(i);
  order.sort(function (a, b) {
    return values[a] - values[b];
  });

  var ranks = [];
  var i = 0;
  while (i < order.length) {
    var j = i;
    while (j < order.length && values[order[j]] == values[order[i]]) j++;
    var avgRank = (i + 1 + j) / 2;
    for (var k = i; k < j; k++) ranks[order[k]] = avgRank;
    i = j;
  }
  return ranks;
}

function spearman(x, y) {
  return pearson(getRanks(x), getRanks(y));
}

function tiedPairs(values) {
  var counts = {};
  for (var i = 0; i < values.length; i++) {
    counts[values[i]] = (counts[values[i]] || 0) + 1;
  }
  var total = 0;
  for (var key in counts) {
    total += (counts[key] * (counts[key] - 1)) / 2;
  }
  return total;
}

function kendall(x, y) {
  var n = x.length;
  var same = 0,
    different = 0;
  for (var i = 0; i < n - 1; i++) {
    for (var j = i + 1; j < n; j++) {
      var s = (x[i] - x[j]) * (y[i] - y[j]);
      if (s > 0) same++;
      else if (s < 0) different++;
    }
  }
  var pairs = (n * (n - 1)) / 2;
  var bottom = Math.sqrt((pairs - tiedPairs(x)) * (pairs - tiedPairs(y)));
  if (bottom == 0) return 0;
  return (same - different) / bottom;
}

function getConclusion(method, r) {
  var a = Math.abs(r);
  var direction = r > 0 ? "прямий" : "обернений";
  var strength = "";
  if (a >= 0.7) strength = "Сильний";
  else if (a >= 0.3) strength = "Помірний";

  if (method == "pearson") {
    if (strength == "") return "Слабкий або відсутній лінійний зв’язок";
    return strength + " лінійний " + direction + " зв’язок";
  }
  if (method == "spearman") {
    if (strength == "") return "Слабкий або відсутній монотонний зв’язок";
    return strength + " монотонний " + direction + " зв’язок";
  }
  if (strength == "") return "Слабкий або відсутній зв’язок рангів";
  return strength + " зв’язок рангів (" + direction + ")";
}

function parseNumbers(text, name) {
  if (text.trim() == "") {
    throw new Error("Вибірка " + name + " не може бути порожньою");
  }
  var parts = text.split(/[\s,;]+/);
  var result = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] == "") continue;
    var num = Number(parts[i].replace(",", "."));
    if (isNaN(num)) {
      throw new Error(
        "У вибірці " + name + " є нечислове значення на позиції " + (i + 1),
      );
    }
    result.push(num);
  }
  return result;
}

Chart.defaults.color = "#4b5563";
Chart.defaults.font.family = "system-ui, sans-serif";
if (window.innerWidth < 600) Chart.defaults.font.size = 11;

var whiteBackground = {
  id: "whiteBackground",
  beforeDraw: function (chart) {
    chart.ctx.save();
    chart.ctx.fillStyle = "#ffffff";
    chart.ctx.fillRect(0, 0, chart.width, chart.height);
    chart.ctx.restore();
  },
};

var canvas = get("plot");

function makeScatter(element) {
  return new Chart(element, {
    type: "scatter",
    plugins: [whiteBackground],
    data: {
      datasets: [
        {
          data: [],
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#2563eb",
        },
        {
          type: "line",
          data: [],
          borderColor: "#dc2626",
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: "#e5e7eb" }, title: { display: true, text: "X" } },
        y: { grid: { color: "#e5e7eb" }, title: { display: true, text: "Y" } },
      },
    },
  });
}

var scatterChart = makeScatter(canvas);
var labChart = makeScatter(get("labPlot"));

var barChart = new Chart(get("bars"), {
  type: "bar",
  plugins: [whiteBackground],
  data: {
    labels: ["Пірсон", "Спірмен", "Кендалл"],
    datasets: [{ data: [0, 0, 0] }],
  },
  options: {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: "Порівняння коефіцієнтів" },
    },
    scales: { y: { min: -1, max: 1 } },
  },
});

function getLine(x, y) {
  var mx = average(x),
    my = average(y);
  var top = 0,
    bottom = 0;
  for (var i = 0; i < x.length; i++) {
    top += (x[i] - mx) * (y[i] - my);
    bottom += (x[i] - mx) * (x[i] - mx);
  }
  if (bottom == 0) return null;
  var k = top / bottom;
  return { k: k, b: my - k * mx };
}

function fillChart(chart, x, y, ranksMode, duration) {
  var points = [];
  var linePoints = [];
  for (var i = 0; i < x.length; i++) {
    points.push({ x: x[i], y: y[i] });
  }
  var line = getLine(x, y);
  if (line != null) {
    var minX = Math.min.apply(null, x);
    var maxX = Math.max.apply(null, x);
    linePoints.push({ x: minX, y: line.k * minX + line.b });
    linePoints.push({ x: maxX, y: line.k * maxX + line.b });
  }
  chart.data.datasets[0].data = points;
  chart.data.datasets[1].data = linePoints;
  chart.options.scales.x.title.text = ranksMode ? "ранг X" : "X";
  chart.options.scales.y.title.text = ranksMode ? "ранг Y" : "Y";
  chart.options.animation.duration = duration;
  chart.update();
}

function updateScatter(duration) {
  if (current == null) {
    fillChart(scatterChart, [], [], false, duration);
    return;
  }
  var x = showRanks ? getRanks(current.x) : current.x;
  var y = showRanks ? getRanks(current.y) : current.y;
  fillChart(scatterChart, x, y, showRanks, duration);
}

function updateBars(all, method) {
  var values = [0, 0, 0];
  var colors = ["#cbd5e1", "#cbd5e1", "#cbd5e1"];
  if (all != null) {
    values = [all.pearson, all.spearman, all.kendall];
    if (method == "pearson") colors[0] = "#2563eb";
    if (method == "spearman") colors[1] = "#2563eb";
    if (method == "kendall") colors[2] = "#2563eb";
  }
  barChart.data.datasets[0].data = values;
  barChart.data.datasets[0].backgroundColor = colors;
  barChart.update();
}

function setButtons() {
  var disabled = current == null || recording;
  get("btnView").disabled = disabled;
  get("btnRec").disabled = disabled;
  get("btnPng").disabled = disabled;
  get("btnTxt").disabled = savedResults.length == 0;
}

function calculate() {
  get("msg").textContent = "";
  try {
    var x = parseNumbers(get("txtX").value, "X");
    var y = parseNumbers(get("txtY").value, "Y");

    if (x.length != y.length)
      throw new Error("Вибірки повинні мати однакову довжину");
    if (x.length < 2)
      throw new Error("Вибірка повинна містити щонайменше 2 елементи");
    if (x.length > 1000)
      throw new Error("Вибірка не може містити більше 1000 елементів");

    var method = document.querySelector("input[name=m]:checked").value;
    var all = {
      pearson: pearson(x, y),
      spearman: spearman(x, y),
      kendall: kendall(x, y),
    };
    var r = all[method];
    var text = getConclusion(method, r);

    current = { x: x, y: y, method: method, r: r, text: text };

    addResult(current);

    get("result").innerHTML =
      names[method] +
      ": <strong>" +
      r.toFixed(4) +
      "</strong><br>" +
      text +
      " · n = " +
      x.length;
    get("needle").style.left = 50 + r * 50 + "%";

    setButtons();
    updateScatter(900);
    updateBars(all, method);
  } catch (err) {
    get("msg").textContent = "Помилка: " + err.message;
  }
}

function clearAll() {
  get("txtX").value = "";
  get("txtY").value = "";
  get("preset").value = "";
  get("result").textContent = "Введіть дані та натисніть «Обчислити»";
  get("msg").textContent = "";
  get("needle").style.left = "50%";

  current = null;
  showRanks = false;
  get("btnView").textContent = "Показати ранги";

  setButtons();
  updateScatter(0);
  updateBars(null);
}

function toggleRanks() {
  showRanks = !showRanks;
  get("btnView").textContent = showRanks
    ? "Показати значення"
    : "Показати ранги";
  updateScatter(1200);
}

function download(blob, fileName) {
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function recordVideo() {
  if (current == null || recording) return;
  if (!window.MediaRecorder) {
    get("msg").textContent = "Цей браузер не підтримує запис відео";
    return;
  }

  recording = true;
  setButtons();
  get("btnRec").textContent = "Запис…";

  var chunks = [];
  var recorder = new MediaRecorder(canvas.captureStream(30));
  recorder.ondataavailable = function (e) {
    chunks.push(e.data);
  };
  recorder.onstop = function () {
    download(new Blob(chunks, { type: "video/webm" }), "correlation.webm");
  };

  showRanks = false;
  scatterChart.data.datasets[0].data = [];
  scatterChart.data.datasets[1].data = [];
  scatterChart.update("none");

  recorder.start();
  await wait(300);
  updateScatter(1500);
  await wait(2200);
  showRanks = true;
  updateScatter(1500);
  await wait(2200);
  showRanks = false;
  updateScatter(1500);
  await wait(1800);
  recorder.stop();

  recording = false;
  setButtons();
  get("btnRec").textContent = "Записати відео";
  get("btnView").textContent = "Показати ранги";
}

var presets = {
  pos: [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [2.1, 3.9, 6.2, 7.8, 10.1, 12.2, 13.8, 16.1, 18, 20.3],
  ],
  neg: [
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    [20, 18.5, 16, 14.2, 12, 9.8, 8.1, 6, 4.2, 2],
  ],
  none: [
    [3, 8, 1, 9, 5, 2, 7, 4, 10, 6],
    [5, 2, 9, 4, 8, 3, 10, 1, 6, 7],
  ],
  curve: [
    [1, 2, 3, 4, 5, 6, 7, 8],
    [1, 4, 9, 16, 25, 36, 49, 64],
  ],
};

function loadPreset() {
  var data = presets[get("preset").value];
  if (data == undefined) return;
  get("txtX").value = data[0].join(", ");
  get("txtY").value = data[1].join(", ");
  calculate();
}

var seed = 12345;
function random() {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}

function randomNormal() {
  return Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random());
}

function standardize(arr) {
  var m = average(arr);
  var sum = 0;
  for (var i = 0; i < arr.length; i++) sum += (arr[i] - m) * (arr[i] - m);
  var sd = Math.sqrt(sum / arr.length);
  var result = [];
  for (var i = 0; i < arr.length; i++) result.push((arr[i] - m) / sd);
  return result;
}

var LAB_SIZE = 40;
var labA = [],
  labB = [];
for (var i = 0; i < LAB_SIZE; i++) {
  labA.push(randomNormal());
  labB.push(randomNormal());
}
labA = standardize(labA);

var overlap = 0;
for (var i = 0; i < LAB_SIZE; i++) overlap += labA[i] * labB[i];
overlap = overlap / LAB_SIZE;
for (var i = 0; i < LAB_SIZE; i++) labB[i] = labB[i] - overlap * labA[i];
labB = standardize(labB);

var labXs = [],
  labYs = [];

function onSlider() {
  var r = get("lab").value / 100;
  var rest = Math.sqrt(1 - r * r);
  get("labr").textContent = r.toFixed(2);

  labXs = [];
  labYs = [];
  for (var i = 0; i < LAB_SIZE; i++) {
    labXs.push(Math.round((50 + 15 * labA[i]) * 10) / 10);
    labYs.push(
      Math.round((50 + 15 * (r * labA[i] + rest * labB[i])) * 10) / 10,
    );
  }
  fillChart(labChart, labXs, labYs, false, 250);

  var p = pearson(labXs, labYs);
  get("labText").textContent = getConclusion("pearson", p);
  get("labInfo").textContent =
    "Пірсон " +
    p.toFixed(3) +
    " · Спірмен " +
    spearman(labXs, labYs).toFixed(3) +
    " · Кендалл " +
    kendall(labXs, labYs).toFixed(3);
}

function sendToAnalysis() {
  get("txtX").value = labXs.join(", ");
  get("txtY").value = labYs.join(", ");
  showPage("analysis");
  calculate();
}

function loadResults() {
  try {
    return JSON.parse(localStorage.getItem("correlationResults")) || [];
  } catch (err) {
    return [];
  }
}

function saveResults() {
  try {
    localStorage.setItem("correlationResults", JSON.stringify(savedResults));
  } catch (err) {}
}

function addResult(item) {
  savedResults.unshift({
    time: new Date().toLocaleString("uk-UA"),
    method: item.method,
    r: item.r,
    text: item.text,
    x: item.x,
    y: item.y,
  });
  if (savedResults.length > 20) savedResults.pop();
  saveResults();
  renderResults();
}

function renderResults() {
  var list = get("historyList");
  list.innerHTML = "";
  if (savedResults.length == 0) {
    list.innerHTML = '<li class="empty">Історія порожня</li>';
  }
  for (var i = 0; i < savedResults.length; i++) {
    var item = savedResults[i];
    var li = document.createElement("li");
    li.textContent =
      item.time +
      " — " +
      names[item.method] +
      " " +
      item.r.toFixed(4) +
      " (n = " +
      item.x.length +
      "): " +
      item.text;
    li.onclick = restoreResult.bind(null, i);
    list.appendChild(li);
  }
  setButtons();
}

function restoreResult(index) {
  var item = savedResults[index];
  get("txtX").value = item.x.join(", ");
  get("txtY").value = item.y.join(", ");
  document.querySelector("input[name=m][value=" + item.method + "]").checked =
    true;
  calculate();
}

var pages = ["analysis", "lab", "theory"];

function showPage(name) {
  for (var i = 0; i < pages.length; i++) {
    get("page-" + pages[i]).hidden = pages[i] != name;
    get("tab-" + pages[i]).classList.toggle("active", pages[i] == name);
  }

  scatterChart.resize();
  barChart.resize();
  labChart.resize();
}

get("btnCalc").onclick = function () {
  calculate();
};
get("btnClear").onclick = clearAll;
get("btnView").onclick = toggleRanks;
get("btnRec").onclick = recordVideo;
get("preset").onchange = loadPreset;
get("lab").oninput = onSlider;
get("btnToAnalysis").onclick = sendToAnalysis;
get("btnClearHistory").onclick = function () {
  savedResults = [];
  saveResults();
  renderResults();
};
get("tab-analysis").onclick = function () {
  showPage("analysis");
};
get("tab-lab").onclick = function () {
  showPage("lab");
};
get("tab-theory").onclick = function () {
  showPage("theory");
};

get("btnPng").onclick = function () {
  canvas.toBlob(function (blob) {
    download(blob, "scatter.png");
  });
};
get("btnTxt").onclick = function () {
  var lines = [];
  for (var i = savedResults.length - 1; i >= 0; i--) {
    var s = savedResults[i];
    lines.push(s.time);
    lines.push("Коефіцієнт " + names[s.method] + ": " + s.r.toFixed(4));
    lines.push("Висновок: " + s.text);
    lines.push("");
  }
  var blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  download(blob, "results.txt");
};

onSlider();
renderResults();
