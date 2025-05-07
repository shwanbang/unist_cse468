const parseDate = d3.timeParse("%d-%b-%y");
const rowsPerPage = 10;
const pageBlockSize = 10;
let data = [], filteredData = [], filters = {};
let sortConfig = { key: null, ascending: true };
let currentPage = 1;
let globalDateRange = null;

const table = d3.select("#data-table");
const thead = table.select("thead");
const tbody = table.select("tbody");
const pagination = d3.select("#pagination");

d3.csv("chocolate_sales.csv").then(tableData => {
  tableData.forEach(row => {
    row._date = parseDate(row.Date);
  });
  data = tableData;
  filteredData = [...data];
  setupTable(data.columns);
  updateTable();
});

d3.csv("chocolate_sales.csv").then(rawData => { 
  rawData.forEach(d => {
    d.date = parseDate(d.Date);
    d.amount = +d.Amount.replace(/[$,]/g, '');
  });

  const salesByMonth = d3.rollup(
    rawData,
    v => d3.sum(v, d => d.amount),
    d => d3.timeMonth(d.date)
  );

  const monthlyData = Array.from(salesByMonth, ([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date - b.date);

  setTimeout(() => drawChart(monthlyData), 0);
});

function drawChart(chartData) {
    const svg = d3.select("#chart");
    const fullWidth = svg.node().getBoundingClientRect().width;
    const chartWidth = fullWidth / 2;

    const margin = { top: 20, right: 20, bottom: 110, left: 50 };
    const margin2 = { top: 400, right: 20, bottom: 50, left: 50 };
    const barMargin = { top: 20, right: 20, bottom: 110, left: 60 };
    const height = 480 - margin.top - margin.bottom;
    const height2 = 500 - margin2.top - margin2.bottom;

    const x = d3.scaleTime().range([0, chartWidth - margin.left - margin.right]);
    const x2 = d3.scaleTime().range([0, chartWidth - margin.left - margin.right]);
    const y = d3.scaleLinear().range([height, 0]);
    const y2 = d3.scaleLinear().range([height2, 0]);

    const xBar = d3.scaleBand().padding(0.2).range([0, chartWidth - barMargin.left - barMargin.right]);
    const yBar = d3.scaleLinear().range([height, 0]);
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

    const area = d3.area()
      .x(d => x(d.date))
      .y0(height)
      .y1(d => y(d.amount));

    const area2 = d3.area()
      .x(d => x2(d.date))
      .y0(height2)
      .y1(d => y2(d.amount));

    const brush = d3.brushX()
      .extent([[0, 0], [chartWidth - margin.left - margin.right, height2]])
      .on("brush end", brushed);

    const svgMain = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const svgContext = svg.append("g").attr("transform", `translate(${margin2.left},${margin2.top})`);
    const svgBar = svg.append("g").attr("transform", `translate(${chartWidth + barMargin.left},${barMargin.top})`);

    x.domain(d3.extent(chartData, d => d.date));
    y.domain([0, d3.max(chartData, d => d.amount)]);
    x2.domain(x.domain());
    y2.domain(y.domain());

    svg.append("defs").append("clipPath")
      .attr("id", "clip")
      .append("rect")
      .attr("id", "clip-rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", chartWidth - margin.left - margin.right)
      .attr("height", height);

    svgMain.append("path")
      .datum(chartData)
      .attr("class", "area")
      .attr("clip-path", "url(#clip)")
      .attr("d", area)
      .attr("fill", "steelblue")
      .attr("opacity", 0.7);
    

    svgMain.append("g")
      .attr("class", "x axis")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x));

    svgMain.append("g").call(d3.axisLeft(y));

    svgContext.append("path")
      .datum(chartData)
      .attr("class", "area")
      .attr("d", area2)
      .attr("fill", "lightgray");

    svgContext.append("g")
      .attr("transform", `translate(0,${height2})`)
      .call(d3.axisBottom(x2).tickFormat(d3.timeFormat("%b")));

    svgContext.append("g")
      .attr("class", "brush")
      .call(brush);
    

    function brushed(event) {
      const selection = event.selection;
      if (!selection) return;
    
      let [x0, x1] = selection.map(x2.invert);
      if (x1 < x0) [x0, x1] = [x1, x0];
      globalDateRange = [x0, x1];
    
      // ✅ x축만 zoom
      x.domain([x0, x1]);
    
      // ✅ 전체 데이터를 유지하면서 zoom된 x축 적용
      svgMain.select("path.area")
        .datum(chartData)
        .transition().duration(200)
        .attr("d", area);
    
      svgMain.select(".x.axis")
        .transition().duration(200)
        .call(d3.axisBottom(x));
      
      svg.select("#clip-rect")
        .attr("width", x.range()[1] - x.range()[0]);
      
    
      updateBarChart([x0, x1]);
      updateTable();
    }
      
      
      
      

    document.getElementById("reset-button").addEventListener("click", () => {
      x.domain(x2.domain());
      svgMain.select("path.area")
        .datum(chartData)
        .transition().duration(200)
        .attr("d", area);

      svgMain.select(".x.axis")
        .transition().duration(200)
        .call(d3.axisBottom(x));

      svgContext.select(".brush").call(brush.move, null);

      // ✅ 필터 및 UI 상태 초기화
      filters = {};
      currentPage = 1;
      globalDateRange = null;
      d3.selectAll("select.filter").property("value", "");
      d3.selectAll("input.filter").property("value", "");
      d3.selectAll(".bar").classed("selected", false).classed("dimmed", false);

      updateBarChart(null);
      updateTable();
    });

    function updateBarChart(dateRange) {
      d3.csv("chocolate_sales.csv").then(raw => {
        raw.forEach(d => {
          d.date = parseDate(d.Date);
          d.amount = +d.Amount.replace(/[$,]/g, '');
        });

        const productSales = d3.rollup(
          raw.filter(d => !dateRange || (d.date >= dateRange[0] && d.date <= dateRange[1])),
          v => d3.sum(v, d => d.amount),
          d => d.Product
        );

        const barData = Array.from(productSales, ([product, total]) => ({ product, total }));

        xBar.domain(barData.map(d => d.product));
        yBar.domain([0, d3.max(barData, d => d.total)]);
        svgBar.selectAll("*").remove();

        svgBar.append("g").call(d3.axisLeft(yBar));
        svgBar.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(d3.axisBottom(xBar))
          .selectAll("text")
          .style("text-anchor", "end")
          .attr("dx", "-.8em")
          .attr("dy", ".15em")
          .attr("transform", "rotate(-45)");

        svgBar.selectAll(".bar")
          .data(barData)
          .enter()
          .append("rect")
          .attr("class", "bar")
          .attr("x", d => xBar(d.product))
          .attr("y", d => yBar(d.total))
          .attr("width", xBar.bandwidth())
          .attr("height", d => height - yBar(d.total))
          .attr("fill", d => colorScale(d.product))
          .style("cursor", "pointer")
          .on("click", (event, d) => {
            filters["Product"] = d.product.toLowerCase();
            d3.select("#product-filter").property("value", d.product);
            currentPage = 1;
            updateTable();
          
            // 강조/흐림 처리
            svgBar.selectAll(".bar")
              .classed("selected", b => b.product === d.product)
              .classed("dimmed", b => b.product !== d.product);
          });
      });
    }

    updateBarChart(null);
  }

function setupTable(columns) {
  const headerRow = thead.append("tr");
  const filterRow = thead.append("tr");
  const dropdownCols = ["Sales Person", "Country", "Product"];

  columns.forEach(col => {
    headerRow.append("th").text(col).on("click", () => {
      sortConfig.key = col;
      sortConfig.ascending = !sortConfig.ascending;
      updateTable();
    });

    const cell = filterRow.append("th");
    if (dropdownCols.includes(col)) {
      const unique = Array.from(new Set(data.map(d => d[col]))).sort();
      const select = cell.append("select")
        .attr("class", "filter")
        .attr("id", col === "Product" ? "product-filter" : null)
        .on("change", function () {
          filters[col] = this.value === "" ? undefined : this.value.toLowerCase();
          currentPage = 1;
          updateTable();
        });

      select.append("option").attr("value", "").text(`All ${col}`);
      unique.forEach(val => {
        select.append("option").attr("value", val).text(val);
      });
    } else {
      cell.append("input")
        .attr("class", "filter")
        .attr("placeholder", `Search ${col}`)
        .on("input", function () {
          filters[col] = this.value.trim() === "" ? undefined : this.value.toLowerCase();
          currentPage = 1;
          updateTable();
        });
    }
  });
}

function updateTable() {
  filteredData = data.filter(row => {
    if (globalDateRange) {
      const date = row._date;
      if (!(date >= globalDateRange[0] && date <= globalDateRange[1])) return false;
    }
    return Object.entries(filters).every(([key, val]) => {
      const cell = row[key] || "";
      if (key === "Amount") {
        return cell.replace(/[^0-9.]/g, "").includes(val.replace(/[^0-9.]/g, ""));
      } else {
        return cell.toLowerCase().includes(val);
      }
    });
  });

  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const pageData = filteredData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  tbody.selectAll("tr").remove();
  const rows = tbody.selectAll("tr").data(pageData).enter().append("tr");
  const displayColumns = ["Sales Person", "Country", "Product", "Date", "Amount", "Boxes Shipped"];
  rows.selectAll("td").data(d => displayColumns.map(col => d[col])).enter().append("td").text(d => d);

  pagination.selectAll("*").remove();
  const block = Math.floor((currentPage - 1) / pageBlockSize);
  const start = block * pageBlockSize + 1;
  const end = Math.min(start + pageBlockSize - 1, totalPages);

  if (block > 0) {
    pagination.append("button").text("<<").on("click", () => { currentPage = 1; updateTable(); });
    pagination.append("button").text("<").on("click", () => { currentPage = start - 1; updateTable(); });
  }
  for (let i = start; i <= end; i++) {
    pagination.append("button")
      .text(i)
      .attr("disabled", i === currentPage ? true : null)
      .on("click", () => { currentPage = i; updateTable(); });
  }
  if (end < totalPages) {
    pagination.append("button").text(">").on("click", () => { currentPage = end + 1; updateTable(); });
    pagination.append("button").text(">>").on("click", () => { currentPage = totalPages; updateTable(); });
  }
}
