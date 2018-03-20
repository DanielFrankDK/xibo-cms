// TIMELINE Module

// Load templates
const timelineTemplate = require('../templates/timeline.hbs');

/**
 * Timeline contructor
 * @param {object} container - the container to render the timeline to
 * @param {object =} [options] - Timeline options
 * @param {number} layoutDuration - total duration of the layout
 */
var Timeline = function(container, layoutDuration) {
    this.DOMObject = container;
    this.layoutDuration = layoutDuration;

    this.scrollPercent = {
        left: 0,
        right: 0
    };

    // Properties to be used for the template
    this.properties = {
        zoom: -1, // Zoom by default is -1 so that can be calculated based on the widgets of the regions
        startingZoom: -1,
        minTime: 0,
        maxTime: layoutDuration,
        deltatime: layoutDuration,
        zoomInDisable: '',
        zoomOutDisable: '',
        scrollPosition: 0, // scroll position
        widgetMinimumVisibleRatio: 4, // Minimum % value so that the region details are shown
        widgetMinimumDurationOnStart: 10 // % of the shortest widget to be used to calculate the default zoom 
    };
};

/**
 * Change timeline zoom
 * @param {number} zoom - the change to be applied to zoom ( -1:zoomOut, 0: default, 1: zoomIn )
 */
Timeline.prototype.changeZoom = function(zoom) {
    
    // Reset to starting zoom
    if(zoom == 0){
        this.properties.scrollPosition = 0;
        this.properties.zoom = this.properties.startingZoom;
        return;
    }

    var zoomVariation = 10;
    
    if(this.properties.zoom >= 5000) {
        zoomVariation = 1000;
    } else if(this.properties.zoom >= 1000) {
        zoomVariation = 200;
    } else if(this.properties.zoom >= 500) {
        zoomVariation = 100;
    } else if(this.properties.zoom >= 200) {
        zoomVariation = 50;
    }

    // Calculate new zoom value
    var newZoom = Math.round(this.properties.zoom + (zoomVariation * zoom));
    
    // Reset zoom enable flags
    this.properties.zoomOutDisable = this.properties.zoomInDisable = '';

    // If zoom out is 100% or less disable button limit it to 100%
    if( newZoom <= 100 ){
        newZoom = 100;
        this.properties.zoomOutDisable = 'disabled';
        
        // Set scroll position to 0
        this.properties.scrollPosition = 0;
    }

    // Set the zoom and calculate the max time for the ruler
    this.properties.zoom = newZoom;
};

/**
 * Calculate time values/labels based on zoom and position of the scroll view
 */
Timeline.prototype.calculateTimeValues = function() {

    this.properties.deltatime = Math.round(10 * (this.layoutDuration / (this.properties.zoom / 100))) / 10;
    this.properties.minTime = Math.round(10 * (this.properties.scrollPosition * this.layoutDuration)) / 10;
    this.properties.maxTime = this.properties.minTime + this.properties.deltatime;
};

/**
 * Update timeline labels after rendering
 */
Timeline.prototype.updateLabels = function() {

    this.DOMObject.find('#minTime').html(this.properties.minTime + 's');
    this.DOMObject.find('#maxTime').html(this.properties.maxTime + 's');
    this.DOMObject.find('#zoom').html(this.properties.deltatime + 's');
};

/**
 * If zoom is not defined, calculate default value based on widget lenght
 * @param {object} regions - Layout regions
 */
Timeline.prototype.calculateStartingZoom = function(regions) {

    // Find the smallest widget ( by duration )
    var smallerWidgetDuration = -1;
    for(region in regions) {
        for(widget in regions[region].widgets) {
            if(regions[region].widgets[widget].getDuration() < smallerWidgetDuration || smallerWidgetDuration == -1){
                smallerWidgetDuration = regions[region].widgets[widget].getDuration();
            }
        }
    }

    // Calculate zoom and limit its minimum to 100%
    this.properties.zoom = Math.floor(this.properties.widgetMinimumDurationOnStart / (smallerWidgetDuration / this.layoutDuration));
    
    if(this.properties.zoom <= 100 ) {
        this.properties.zoom = this.properties.startingZoom = 100;
        this.properties.zoomOutDisable = 'disabled';
    } else {
        this.properties.zoomOutDisable = '';
    }

    this.properties.startingZoom = this.properties.zoom;
};

/**
 * Check regions and choose display type ( detailed/zoom-to-see-details) 
 * @param {object} regions - Layout regions
 */
Timeline.prototype.checkRegionsVisibility = function(regions) {

    var visibleDuration = this.layoutDuration * (100 / this.properties.zoom); //this.properties.maxTime - this.properties.minTime;
    
    for(region in regions) {
        // Reset the region visibility flag
        regions[region].hideDetails = false;

        for(widget in regions[region].widgets) {

            // Calculate the ratio of the widget compared to the region length
            var widthRatio = regions[region].widgets[widget].getDuration() / visibleDuration;

            // Mark region as hidden if the widget is too small to be displayed
            if(widthRatio < (this.properties.widgetMinimumVisibleRatio/100)) {
                regions[region].hideDetails = true;
                break;
            }
        }
    }
};

/**
 * Create widget replicas
 * @param {object} regions - Layout regions
 */
Timeline.prototype.createGhostWidgetsDinamically = function(regions) {

    for(region in regions) {
        var currentRegion = regions[region];

        // if the regions isn't marked for looping, skip to the next one
        if(!currentRegion.loop) {
            continue;
        }

        var widgetsTotalDuration = 0;
        var ghostWidgetsObject = [];

        // calculate widgets total duration
        for(widget in currentRegion.widgets) {
            widgetsTotalDuration += currentRegion.widgets[widget].getDuration();
        }

        // starting and ending time to check/draw ghosts in
        //      get the ghosts drawing starting time, depending on the minimum visualization time and if the widgets are shown on screen after it or not
        var ghostsStartTime = (widgetsTotalDuration > this.properties.minTime) ? widgetsTotalDuration : this.properties.minTime;
        var ghostsEndTime = this.properties.maxTime;
        
        // distance from the beggining of ghosts and the end of the widgets
        var paddingLeft = 0;

        // if the widgets are shown until the end visualization ( or after ), don't draw any ghosts
        if(widgetsTotalDuration > ghostsEndTime){
            return;
        }

        // start the auxiliar time just after the widgets
        var auxTime = widgetsTotalDuration;

        // go through auxiliar time, advancing with each widget's time
        while( auxTime < ghostsEndTime) {

            // repeat widget playlist to advance time and create the ghost widgets
            for(widget in currentRegion.widgets) {

                // if the next widget shows on the time span, add it to the array
                if(auxTime + currentRegion.widgets[widget].getDuration() > ghostsStartTime) {
                    // clone widget to create a ghost
                    var ghost = currentRegion.widgets[widget].createClone();

                    // if the ghost goes after the layout ending, crop it
                    if(auxTime + ghost.data.duration > this.layoutDuration) {
                        var cropDuration = ghost.data.duration - ((auxTime + ghost.data.duration) - this.layoutDuration);
                        ghost.data.duration = cropDuration;
                    }

                    // Add ghost to the array
                    ghostWidgetsObject.push(ghost);
                } else {                
                    paddingLeft += currentRegion.widgets[widget].getDuration();
                }

                // Advance auxiliar time with the widget duration
                auxTime += currentRegion.widgets[widget].getDuration();

                // if the time has passed the end ghost time, break out from the widget loop
                if(auxTime >= ghostsEndTime){
                    break;
                }
            }
        }

        // flag to see if there's padding
        currentRegion.ghostWidgetsHavePadding = (paddingLeft > 0);
    
        // Calulate padding in percentage ( related to the duration )
        currentRegion.ghostWidgetsPadding = (paddingLeft / this.layoutDuration) * 100;

        // add ghost object array to the region
        currentRegion.ghostWidgetsObject = ghostWidgetsObject;
    }
};

/**
 * Render Timeline and the layout
 * @param {Object} layout - the layout object to be rendered
 */
Timeline.prototype.render = function(layout) {

    // If starting zoom is not defined, calculate its value based on minimum widget duration
    if(this.properties.zoom == -1) {
        this.calculateStartingZoom(layout.regions);
    }

    // Calulate time values based on scroll position
    this.calculateTimeValues();
    
    // Check regions to see if they can be rendered with details or not
    this.checkRegionsVisibility(layout.regions);

    // Check widget repetition and create ghosts
    this.createGhostWidgetsDinamically(layout.regions);

    // Render timeline template using layout object
    var html = timelineTemplate({
        layout: layout, 
        properties: this.properties
    });

    // Append layout html to the main div
    this.DOMObject.html(html);

    // Load region container
    var regionsContainer = this.DOMObject.find('#regions-container');

    // Maintain the previous scroll position
    regionsContainer.scrollLeft(this.properties.scrollPosition * regionsContainer.find("#regions").width());

    // Update timeline labels
    this.updateLabels();

    // Enable hover and select for each layout/region
    this.DOMObject.find('.selectable').click(function(e) {
        e.stopPropagation();
        selectObject($(this));
    });

    // Button actions
    var self = this;
    this.DOMObject.find('#zoomIn').click(function() {
        self.changeZoom(1);
        self.render(layout);
    });

    this.DOMObject.find('#zoomOut').click(function() {
        self.changeZoom(-1);
        self.render(layout);
    });

    this.DOMObject.find('#zoom').click(function() {
        self.changeZoom(0);
        self.render(layout);
    });
    
    regionsContainer.scroll($.debounce(500, function() { //TODO: try to find a best alternative to the debounce

        // Get new scroll position
        var newScrollPosition = $(this).scrollLeft() / $(this).find("#regions").width();

        // Only render if the scroll position has been updated
        if(self.properties.scrollPosition != newScrollPosition) {
            self.properties.scrollPosition = newScrollPosition;
            self.render(layout);
        }
    }));
};

module.exports = Timeline;
