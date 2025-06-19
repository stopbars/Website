# EuroScope Guide

The BARS plugin for EuroScope simulates a basic lighting control panel which supports control of stopbars defined in the BARS database; the state of these stopbars is sent to the BARS server, which forwards them to pilots.

<br>

## Installation

In EuroScope, for all profiles on which you wish to use BARS, select the "Plug-ins" menu from the "Other Set" toolbar item, click "Load", and select the main plugin DLL ("bars.dll"). Then, move all display types on which you wish to have the stopbar controls displayed into the "Allowed to draw on types" section. Typically, this will include all SMR display types, but not any airborne radar screens.

<br>

<figure>
    <img src="../Assets/1.png">
    <figcaption>ASR types sorted into "Allowed" and "Forbidden to draw on"</figcaption>
</figure>

<br>

The BARS menu button will appear in the top-right corner of the radar screen for all screens on which the plugin is allowed to draw.

<br>

<figure>
    <img src="../Assets/2.png">
    <figcaption>BARS menu button ("BARS off")</figcaption>
</figure>

<br>

## Setup

Before using the plugin, controllers must obtain an API key from the [BARS website](https://stopbars.com/). Sign up for an account first, then inside the "Account Settings" page, click "Show Token" to obtain your token. Do not share this token with anyone.

<br>

Click the BARS menu button to open the BARS menu popup. Click "Set API key", paste your API key into the text box, and press <kbd>Enter</kbd>.

<br>

## Using the plugin

If your API key is correctly set, the plugin will automatically connect when you connect to VATSIM as a controller. If it does not, select "Connect" from the BARS menu.

<br>

Once connected, the BARS menu button will change to indicate how many runways you have currently claimed (initially, this will be zero).

<br>

To claim runways, click BARS menu button, and then click "Set runway ownership". If you have set your active airports through the EuroScope runways popup, the runway ownership menu will list any runways defined in the BARS database associated with those airports. To claim or unclaim a runway, click it.

<br>

<figure>
    <img src="../Assets/3.png">
    <figcaption>Claiming a runway, with one already claimed</figcaption>
</figure>

<br>

Once a runway is claimed, you can toggle the state of stopbars by clicking them on the radar. They are drawn in the same position as they are shown in the pilots' scenery, and so may not line up exactly with the radar display elements.

<br>

<figure>
    <img src="../Assets/4.png">
    <figcaption>Toggling the state of a runway stopbar</figcaption>
</figure>

<br>

If a pilot is using the BARS pilot client, a small green dot is drawn over their radar target.