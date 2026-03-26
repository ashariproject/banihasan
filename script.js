// Constants for node size
const NODE_WIDTH = 180;
const NODE_HEIGHT = 75;
const SPOUSE_SPACING = 20; // Spacing for connector icon

// Setup SVG and Container
const container = document.getElementById("tree-container");
const width = container.clientWidth;
const height = container.clientHeight;

const svg = d3.select("#tree-container")
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .style("background-color", "transparent");

const g = svg.append("g");

// Add zoom and pan functionality
const zoom = d3.zoom()
    .scaleExtent([0.1, 3])
    .on("zoom", (event) => {
        g.attr("transform", event.transform);
    });

svg.call(zoom);

// Setup Tree layout (Vertical) with dynamic spacing via separation logic
const treeLayout = d3.tree()
    .nodeSize([NODE_WIDTH + 50, NODE_HEIGHT + 70])
    .separation((a, b) => {
        // Adjust spacing dynamically ONLY if the spouse is actively being shown
        const aFactor = (a.data.spouse && a.showSpouse) ? 1.8 : 1;
        const bFactor = (b.data.spouse && b.showSpouse) ? 1.8 : 1;
        // Increase base distance slightly for cousins vs siblings
        const siblingGap = a.parent === b.parent ? 0 : 0.1;
        return (aFactor + bFactor) / 2 + siblingGap;
    });

let root;
let clusterRoot;
let i = 0;

// Load CSV data dynamically from local folder or Google Sheets
const DATA_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSeve7fPNHPhqr-5Ve-ydfYfy6unfjzxyaYHjiMg0IySg40WM-ZbCNwvaUDo60Kmy9BnB5cGeyDvDKQ/pub?output=csv";
// Example: const DATA_URL = "data.csv";

d3.csv(DATA_URL).then((csvData) => {
    // Filter out empty rows which might cause d3.stratify to crash
    csvData = csvData.filter(d => d.id && d.id.trim() !== "");

    // Reconstruct spouse objects from flat data
    csvData.forEach(row => {
        if (row.spouseFullName && row.spouseFullName.trim() !== "") {
            row.spouse = {
                fullName: row.spouseFullName,
                nickname: row.spouseNickname,
                location: row.spouseLocation,
                photoUrl: row.spousePhotoUrl
            };
        }
    });

    // Create hierarchy from flat CSV
    root = d3.stratify()
        .id(d => d.id)
        .parentId(d => d.parentId)
        (csvData);

    // Initial root coordinates
    root.x0 = width / 2;
    root.y0 = 60;

    // Prepare initial interaction states
    root.each(d => {
        d.showSpouse = true; // Show spouses by default (they can still be hidden/cascaded)
        
        // Collapse nodes below level 2 (depth 1) by default
        if (d.depth >= 1 && d.children) {
            d._children = d.children;
            d.children = null;
        }
    });

    // Calculate initial scale dynamically for mobile
    const isMobile = window.innerWidth < 600;
    const initialScale = isMobile ? 0.35 : 0.65;
    const initialY = isMobile ? 110 : 140;

    // Apply zoom & pan initially
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, initialY).scale(initialScale));

    update(root);

    // Global expand/collapse logic
    function expandAll(d) {
        d.showSpouse = true; // Also ensure spouse is shown
        if (d._children) {
            d.children = d._children;
            d._children = null;
        }
        if (d.children) {
            d.children.forEach(expandAll);
        }
    }

    function collapseAll(d) {
        if (d.children) {
            d.children.forEach(collapseAll);
            // Collapse everything except root's immediate children (Level 2)
            if (d.depth >= 1) {
                d._children = d.children;
                d.children = null;
            }
        } else if (d._children) {
            d._children.forEach(collapseAll);
        }
    }

    document.getElementById("btn-expand-all").addEventListener("click", () => {
        const current = clusterRoot || root;
        expandAll(current);
        update(current);
    });

    document.getElementById("btn-collapse-all").addEventListener("click", () => {
        const current = clusterRoot || root;
        collapseAll(current);
        update(current);
        // Recalculate based on current screen size
        const isMobile = window.innerWidth < 600;
        const initialScale = isMobile ? 0.35 : 0.65;
        const initialY = isMobile ? 110 : 140;

        // center the root after collapsing all
        svg.transition().duration(500)
            .call(zoom.transform, d3.zoomIdentity.translate(width / 2, initialY).scale(initialScale));
    });

    // Cluster Select logic
    document.getElementById("cluster-select").addEventListener("change", (e) => {
        const val = e.target.value;
        if (val === "all") {
            clusterRoot = root;
        } else {
            clusterRoot = root.descendants().find(d => d.id === val);
            if (!clusterRoot) clusterRoot = root;
        }
        
        clusterRoot.x0 = width / 2;
        clusterRoot.y0 = 60;
        
        expandAll(clusterRoot);
        update(clusterRoot);
        
        const isMobile = window.innerWidth < 600;
        const initialScale = isMobile ? 0.35 : 0.65;
        const initialY = isMobile ? 110 : 140;
        svg.transition().duration(500)
            .call(zoom.transform, d3.zoomIdentity.translate(width / 2, initialY).scale(initialScale));
    });

}).catch(error => {
    console.error("Error loading CSV data:", error);
});

function update(source) {
    // Assigns the x and y position for the nodes
    const treeData = treeLayout(clusterRoot || root);

    // Compute the new tree layout
    const nodes = treeData.descendants();
    const links = treeData.descendants().slice(1);

    // ****************** Nodes section ***************************
    // Update the nodes...
    const node = g.selectAll('g.node')
        .data(nodes, d => d.id || (d.id = ++i));

    // Enter any new nodes at the parent's previous position.
    const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr("transform", d => `translate(${source.x0},${source.y0})`);

    // Add HTML container via foreignObject
    const foEnter = nodeEnter.append("foreignObject")
        .attr("height", NODE_HEIGHT)
        .attr("y", -NODE_HEIGHT / 2);

    // Initial width/x before transition (use current state or default)
    foEnter.attr("width", d => (d.data.spouse && d.showSpouse) ? NODE_WIDTH * 2 + SPOUSE_SPACING : NODE_WIDTH)
           .attr("x", d => (d.data.spouse && d.showSpouse) ? -(NODE_WIDTH * 2 + SPOUSE_SPACING) / 2 : -NODE_WIDTH / 2);

    // Add toggle button for nodes with children
    const toggleGroups = nodeEnter.filter(d => d._children || d.children)
        .append("g")
        .attr("class", "toggle-btn")
        .attr("transform", `translate(0, ${NODE_HEIGHT / 2 + 15})`)
        .style("cursor", "pointer")
        .on('click', (event, d) => {
            if (d.children) {
                d._children = d.children;
                d.children = null;
            } else {
                d.children = d._children;
                d._children = null;
            }
            update(d);
        });

    toggleGroups.append("circle")
        .attr("r", 12)
        .style("fill", "var(--toggle-circle)")
        .style("stroke", "var(--toggle-circle-stroke)")
        .style("stroke-width", "2px");

    toggleGroups.append("text")
        .attr("dy", "4px")
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "var(--text-muted)")
        .style("user-select", "none")
        .text(d => d._children ? "+" : "-");

    // UPDATE
    const nodeUpdate = nodeEnter.merge(node);

    // Transition to the proper position for the node
    nodeUpdate.transition()
        .duration(500)
        .attr("transform", d => `translate(${d.x},${d.y})`);

    // Update foreign object size and position smoothly
    const foUpdate = nodeUpdate.select("foreignObject");
    foUpdate.transition().duration(500)
        .attr("width", d => (d.data.spouse && d.showSpouse) ? NODE_WIDTH * 2 + SPOUSE_SPACING : NODE_WIDTH)
        .attr("x", d => (d.data.spouse && d.showSpouse) ? -(NODE_WIDTH * 2 + SPOUSE_SPACING) / 2 : -NODE_WIDTH / 2);

    // Re-render HTML content in foreignObject based on new state
    foUpdate.html(d => {
        const data = d.data;
        const genClass = `gen-${data.generation || 1}`;

        let htmlContent = `<div class="node-container">`;
        
        // Main Card
        const initChar = data.fullName.charAt(0).toUpperCase();
        const avatarContent = data.photoUrl ? `<img src="${data.photoUrl}" class="avatar-img" alt="${data.fullName}">` : initChar;
        htmlContent += `
            <div class="profile-card ${genClass}">
                <div class="avatar-container">
                    <div class="avatar">${avatarContent}</div>
                </div>
                <div class="info-container">
                    <div class="name" title="${data.fullName}">${data.fullName}</div>
                    <div class="nickname">${data.nickname}</div>
                    <div class="location">
                        <span class="location-icon">📍</span> ${data.location}
                    </div>
                </div>
        `;
        
        // Show button if spouse exists and is hidden
        if (data.spouse && !d.showSpouse) {
            htmlContent += `<div class="spouse-toggle btn-show" title="Tampilkan Pasangan">💍+</div>`;
        }
        
        htmlContent += `</div>`; // Close Main profile-card

        // Render Spouse Card if active
        if (data.spouse && d.showSpouse) {
            const sp = data.spouse;
            const spInit = sp.fullName.charAt(0).toUpperCase();
            const spAvatarContent = sp.photoUrl ? `<img src="${sp.photoUrl}" class="avatar-img" alt="${sp.fullName}">` : spInit;
            htmlContent += `<div class="connector-icon spouse-toggle btn-hide" title="Sembunyikan Pasangan">💍-</div>`;

            htmlContent += `
                <div class="profile-card ${genClass} spouse-card">
                    <div class="avatar-container">
                        <div class="avatar">${spAvatarContent}</div>
                    </div>
                    <div class="info-container">
                        <div class="name" title="${sp.fullName}">${sp.fullName}</div>
                        <div class="nickname">${sp.nickname} <span class="status-badge">(Menantu)</span></div>
                        <div class="location">
                            <span class="location-icon">📍</span> ${sp.location}
                        </div>
                    </div>
                </div>
            `;
        }
        
        htmlContent += `</div>`;
        return htmlContent;
    });

    // Attach click listeners to spouse toggles after HTML is rendered
    foUpdate.each(function(d) {
        d3.select(this).selectAll(".spouse-toggle").on("click", (event) => {
            event.stopPropagation();
            event.preventDefault();
            d.showSpouse = !d.showSpouse;
            update(d);
        });
    });

    // Update text on toggle button
    nodeUpdate.select(".toggle-btn text")
        .text(d => d._children ? "+" : "-");

    // Update color on toggle button
    nodeUpdate.select(".toggle-btn circle")
        .style("fill", d => d._children ? "var(--spouse-toggle)" : "var(--toggle-circle)");

    // Remove any exiting nodes
    const nodeExit = node.exit().transition()
        .duration(500)
        .attr("transform", d => `translate(${source.x},${source.y})`)
        .remove();

    // ****************** Links section ***************************
    // Update the links...
    const link = g.selectAll('path.link')
        .data(links, d => d.id);

    // Enter any new links at the parent's previous position.
    const linkEnter = link.enter().insert('path', "g")
        .attr("class", "link")
        .attr('d', d => {
            const o = { x: source.x0, y: source.y0 };
            return diagonal(o, o);
        });

    // UPDATE
    const linkUpdate = linkEnter.merge(link);

    // Transition back to the parent element coordinate
    linkUpdate.transition()
        .duration(500)
        .attr('d', d => diagonal(d.parent, d));

    // Remove any exiting links
    const linkExit = link.exit().transition()
        .duration(500)
        .attr('d', d => {
            const o = { x: source.x, y: source.y };
            return diagonal(o, o);
        })
        .remove();

    // Store the old positions for transition.
    nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
    });
}

function diagonal(s, d) {
    // If transitioning to/from a collapsed state (s and d have same coordinates)
    if (s.x === d.x && s.y === d.y) {
        return `M ${s.x} ${s.y} C ${s.x} ${s.y}, ${d.x} ${d.y}, ${d.x} ${d.y}`;
    }

    const startY = s.y + NODE_HEIGHT / 2 + 25; // start below the toggle button
    const endY = d.y - NODE_HEIGHT / 2; // end top of target node

    return `M ${s.x} ${startY}
            C ${s.x} ${(startY + endY) / 2},
              ${d.x} ${(startY + endY) / 2},
              ${d.x} ${endY}`;
}

// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
if (themeToggle) {
    const currentTheme = localStorage.getItem('theme') || 'light';
    if (currentTheme === 'dark') {
        document.body.classList.add('dark-mode');
        themeToggle.textContent = '☀️ Light Mode';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('theme', 'dark');
            themeToggle.textContent = '☀️ Light Mode';
        } else {
            localStorage.setItem('theme', 'light');
            themeToggle.textContent = '🌙 Dark Mode';
        }
    });
}
