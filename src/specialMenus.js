/* jshint moz:true */
const Clutter = imports.gi.Clutter
const Cinnamon = imports.gi.Cinnamon
const Lang = imports.lang
const Main = imports.ui.main
const Mainloop = imports.mainloop
const Params = imports.misc.params
const PopupMenu = imports.ui.popupMenu
const Meta = imports.gi.Meta
const Util = imports.misc.util
const St = imports.gi.St
const Gtk = imports.gi.Gtk
const Gio = imports.gi.Gio
const Gettext = imports.gettext
const Tweener = imports.ui.tweener
const Applet = imports.ui.applet;
const l = imports.applet._
const clog = imports.applet.clog
const setTimeout = imports.applet.setTimeout

const AppletDir = imports.ui.appletManager.applets['IcingTaskManager@json']
const SpecialMenuItems = AppletDir.specialMenuItems
const FireFox = AppletDir.firefox

const THUMBNAIL_ICON_SIZE = 16
const OPACITY_OPAQUE = 255

const FavType = {
  favorites: 0,
  pinnedApps: 1,
  none: 2
}

function _ (str) {
  var resultConf = Gettext.dgettext('IcingTaskManager@json', str)
  if (resultConf != str) {
    return resultConf
  }
  return Gettext.gettext(str)
}

function AppMenuButtonRightClickMenu () {
  this._init.apply(this, arguments)
}

AppMenuButtonRightClickMenu.prototype = {
  __proto__: Applet.AppletPopupMenu.prototype,

  _init: function (parent, actor) {
    Applet.AppletPopupMenu.prototype._init.call(this, parent, parent.orientation);

    this.actor.hide()
    this.metaWindow = parent.metaWindow
    this.metaWindows = []
    this._parentActor = actor
    this._parentActor.connect('button-release-event', Lang.bind(this, this._onParentActorButtonRelease))
    this._parentActor.connect('button-press-event', Lang.bind(this, this._onParentActorButtonPress))

    actor.connect('key-press-event', Lang.bind(this, this._onSourceKeyPress))
    this.connect('open-state-changed', Lang.bind(this, this._onToggled))

    this.orientation = parent.orientation
    this.app = parent.app
    this.autostartIndex = parent.autostartIndex
    this.isFavapp = parent.isFavapp
    this._applet = parent._applet
    this.AppMenuWidth = this._applet.settings.getValue('appmenu-width')

    var PinnedFavorites = this._applet.pinned_app_contr()

    this.menuSetup = (init)=>{
      if (!init) {
        this.removeAll()
      }
      this.monitorItems = []
      this.metaWindows = this.app.get_windows()

      this.setupMonitorMoveEvent = (itemChangeMonitor, windows)=>{
        itemChangeMonitor.connect('activate', ()=> {
          this.toggle()
          if (windows.length === 1) {
            this.metaWindow.move_to_monitor(itemChangeMonitor.index)
            this.app.activate(this.metaWindow, global.get_current_time())
          } else {
            for (let i = 0, len = windows.length; i < len; i++) {
              windows[i].move_to_monitor(itemChangeMonitor.index)
              this.app.activate(windows[i], global.get_current_time())
            }
          }
          this.menuSetup(false)
        })
      }
      
      this.createMonitorMoveOptions = ()=>{
        var monitors = Main.layoutManager.monitors
        if (this.monitorItems.length > 0) {
          for (let i = 0, len = this.monitorItems.length; i < len; i++) {
            this.monitorItems[i].destroy()
          }
          this.monitorItems = []
        }
        if (monitors.length > 1) {
          for (let i = 0, len = monitors.length; i < len; i++) {
            if (this.metaWindows[0] !== undefined && this.metaWindows[0].get_monitor() !== i) {
              var itemChangeMonitor = new SpecialMenuItems.IconNameMenuItem(this, _(`Move to monitor ${i+1}`), 'view-fullscreen')
              itemChangeMonitor.index = i
              this.setupMonitorMoveEvent(itemChangeMonitor, this.metaWindows)
              this.monitorItems.push(itemChangeMonitor)
            }
          }
        }
      };

      this.createMonitorMoveOptions()

      this.appInfo = this.app.get_app_info()

      // Pause for refresh of SpecialItems.
      this._applet.recentManager.connect('changed', Lang.bind(this, function (recentManager) {
        var lastFocusedApp = this._applet.getCurrentAppList().lastFocusedApp
        if (lastFocusedApp === this.app.get_id()) {
          this._recent_items_changed(recentManager, lastFocusedApp)
        }
      }))
      this._applet.settings.connect('changed::show-recent', Lang.bind(this, this.menuSetup))
      this._applet.settings.connect('changed::appmenu-width', Lang.bind(this, this._appMenu_width_changed))

      if (this.metaWindows.length > 1) {
        this.itemCloseWindow = new SpecialMenuItems.IconNameMenuItem(this, _('Close All'), 'window-close')
        this.itemCloseWindow.connect('activate', Lang.bind(this, this._onCloseAllActivate))
      } else {
        this.itemCloseWindow = new SpecialMenuItems.IconNameMenuItem(this, _('Close'), 'window-close')
        this.itemCloseWindow.connect('activate', Lang.bind(this, this._onCloseWindowActivate))
      }

      this.itemMinimizeWindow = new SpecialMenuItems.IconNameMenuItem(this, _('Minimize'), 'go-bottom')
      this.itemMinimizeWindow.connect('activate', Lang.bind(this, this._onMinimizeWindowActivate))

      this.itemMaximizeWindow = new SpecialMenuItems.IconNameMenuItem(this, _('Maximize'), 'go-up')
      this.itemMaximizeWindow.connect('activate', Lang.bind(this, this._onMaximizeWindowActivate))

      this.itemMoveToLeftWorkspace = new SpecialMenuItems.IconNameMenuItem(this, _('Move to left workspace'), 'go-previous')
      this.itemMoveToLeftWorkspace.connect('activate', Lang.bind(this, this._onMoveToLeftWorkspace))

      this.itemMoveToRightWorkspace = new SpecialMenuItems.IconNameMenuItem(this, _('Move to right workspace'), 'go-next')
      this.itemMoveToRightWorkspace.connect('activate', Lang.bind(this, this._onMoveToRightWorkspace))

      this.itemOnAllWorkspaces = new SpecialMenuItems.IconNameMenuItem(this, _('Visible on all workspaces'), 'edit-copy')
      this.itemOnAllWorkspaces.connect('activate', Lang.bind(this, this._toggleOnAllWorkspaces))

      this.launchItem = new SpecialMenuItems.IconMenuItem(this, this.app.get_name(), this.app.create_icon_texture(16))
      this.launchItem.connect('activate', Lang.bind(this, function () {
        this.appInfo.launch([], null)
      }))
      // Settings in pinned apps menu
      this._settingsMenu()
      this.specialCont = new SpecialMenuItems.SubSection()
      this.specialCont.box = new St.BoxLayout({
        vertical: true
      })

      this.specialSection = new St.BoxLayout({
        vertical: true
      })
      this.specialCont.box.add(this.specialSection)
      this.specialCont.addActor(this.specialCont.box, {
        span: -1
      })
      this.addSpecialItems()

      this.favs = PinnedFavorites
      this.favId = this.app.get_id()
      this.isFav = this.favs.isFavorite(this.favId)

      if (!this.app.is_window_backed()) {
        if (this._applet.autoStart) {
          if (this.autostartIndex !== -1) {
            this.itemToggleAutostart = new SpecialMenuItems.IconNameMenuItem(this, _('Remove from Autostart'), 'process-stop')
            this.itemToggleAutostart.connect('activate', Lang.bind(this, this._toggleAutostart))
          } else {
            this.itemToggleAutostart = new SpecialMenuItems.IconNameMenuItem(this, _('Add to Autostart'), 'insert-object')
            this.itemToggleAutostart.connect('activate', Lang.bind(this, this._toggleAutostart))
          }
        }
        if (this._applet.showPinned !== FavType.none) {
          if (this.isFav) {
            this.itemtoggleFav = new SpecialMenuItems.IconNameMenuItem(this, _('Unpin from Panel'), 'remove')
            this.itemtoggleFav.connect('activate', Lang.bind(this, this._toggleFav))
          } else {
            this.itemtoggleFav = new SpecialMenuItems.IconNameMenuItem(this, _('Pin to Panel'), 'bookmark-new')
            this.itemtoggleFav.connect('activate', Lang.bind(this, this._toggleFav))
          }
        }
      } else {
        this.itemCreateShortcut = new SpecialMenuItems.IconNameMenuItem(this, _('Create Shortcut'), 'list-add')
        this.itemCreateShortcut.connect('activate', Lang.bind(this, this._createShortcut))
      }
      if (this.isFavapp) {
        this._isFavorite(true)
      } else {
        this._isFavorite(false)
      }
    }

    this.menuSetup(true)
  },

  triggerUpdate: function () {
    this._applet.metaWorkspaces[this._applet.currentWs].appList._refreshList()
  }, 

  updateSetting: function (key, state) {
    this._applet.settings.setValue('arrange-pinnedApps', state)
    this._applet[key] = state
    this.triggerUpdate()
  },

  _settingsMenu: function () {
    this.subMenuItem = new SpecialMenuItems.SubMenuItem(this, _('Settings'))
    var subMenu = this.subMenuItem.menu

    this.reArrange = new SpecialMenuItems.SwitchMenuItem(this, _('Rearrange'), this._applet.arrangePinned)
    this.reArrange.connect('toggled', (item)=>this.updateSetting('arrangePinned', item.state))
    subMenu.addMenuItem(this.reArrange)

    this.showPinned = new SpecialMenuItems.SwitchMenuItem(this, _('Show Pinned'), this._applet.showPinned)
    this.showPinned.connect('toggled', (item)=>this.updateSetting('showPinned', item.state))
    subMenu.addMenuItem(this.showPinned)

    this.showThumbs = new SpecialMenuItems.SwitchMenuItem(this, _('Show Thumbs'), this._applet.showThumbs)
    this.showThumbs.connect('toggled', (item)=>this.updateSetting('showThumbs', item.state))
    subMenu.addMenuItem(this.showThumbs)

    this.stackThumbs = new SpecialMenuItems.SwitchMenuItem(this, _('Stack Thumbs'), this._applet.stackThumbs)
    this.stackThumbs.connect('toggled', (item)=>this.updateSetting('stackThumbs', item.state))
    this.subMenuItem.menu.addMenuItem(this.stackThumbs)

    this.enablePeek = new SpecialMenuItems.SwitchMenuItem(this, _('Peek on Hover'), this._applet.enablePeek)
    this.enablePeek.connect('toggled', (item)=>this.updateSetting('enablePeek', item.state))
    this.subMenuItem.menu.addMenuItem(this.enablePeek)

    this.showRecent = new SpecialMenuItems.SwitchMenuItem(this, _('Show Recent'), this._applet.showRecent)
    this.showRecent.connect('toggled', (item)=>this.updateSetting('showRecent', item.state))
    this.subMenuItem.menu.addMenuItem(this.showRecent)

    this.verticalThumbs = new SpecialMenuItems.SwitchMenuItem(this, _('Vertical Thumbs'), this._applet.verticalThumbs)
    this.verticalThumbs.connect('toggled', (item)=>this.updateSetting('verticalThumbs', item.state))
    this.subMenuItem.menu.addMenuItem(this.verticalThumbs)

    this.settingItem = new SpecialMenuItems.IconNameMenuItem(this, _('     Go to Settings'))
    this.settingItem.connect('activate', Lang.bind(this, this._settingMenu))
    subMenu.addMenuItem(this.settingItem)
  },

  _recent_items_changed: function (recentManager=null, appId=null) {
    if (recentManager) {
      this._applet.sortRecentItems(recentManager.get_items())
      this._applet.refreshAppFromCurrentListById(appId)
    }
  },

  _appMenu_width_changed: function () {
    this.AppMenuWidth = this._applet.settings.getValue('appmenu-width') || 295

    for (let i = 0, len = this.RecentMenuItems.length; i < len; i++) {
      if (!(this.RecentMenuItems[i] instanceof PopupMenu.PopupSeparatorMenuItem)) {
        let item = this.RecentMenuItems[i]
        item.table.width = this.AppMenuWidth
        item.label.width = this.AppMenuWidth - 26
      }
    }

    var children = l.map(this.subMenuItem.menu.box.get_children(), '_delegate')

    for (let i = 0, len = children.length; i < len; i++) {
      let item = children[i]
      item.table.width = this.AppMenuWidth - 14
      item.label.width = this.AppMenuWidth - 74
    }

    children = l.map(this.box.get_children(), '_delegate')

    for (let i = 0, len = children.length; i < len; i++) {
      if (children[i] instanceof SpecialMenuItems.IconNameMenuItem || children[i] instanceof SpecialMenuItems.IconMenuItem || children[i] instanceof SpecialMenuItems.SubMenuItem) {
        var item = children[i]
        item.table.width = this.AppMenuWidth
        item.label.width = this.AppMenuWidth - 26
      }
    }
  },

  addSpecialItems: function () {
    this.RecentMenuItems = []
    if (!this._applet.showRecent) {
      return
    }

    // Load Places
    if (this.app.get_id() == 'nemo.desktop' || this.app.get_id() == 'nemo-home.desktop') {
      var defualtPlaces = this._listDefaultPlaces()
      var bookmarks = this._listBookmarks()
      var devices = this._listDevices()
      var places = defualtPlaces.concat(bookmarks).concat(devices)
      for (let i = 0, len = places.length; i < len; i++) {
        var item = new SpecialMenuItems.PlaceMenuItem(this, places[i])
        this.specialSection.add(item.actor)
        this.RecentMenuItems.push(item)
      }
      return
    } else if (this.app.get_id() == 'firefox.desktop' || this.app.get_id() == 'firefox web browser.desktop') {
      var histories = FireFox.getFirefoxHistory(this._applet)

      if (histories) {
        try {
          histories.length = histories.length
          for (let i = 0, len = histories.length; i < len; i++) {
            var history = histories[i]
            let item = new SpecialMenuItems.FirefoxMenuItem(this, history)
            this.specialSection.add(item.actor)
            this.RecentMenuItems.push(item)
          }
        } catch (e) {}
      }
      this._loadActions()
      return
    }
    // Load Recent Items
    this._listRecent()
    // Load Actions
    this._loadActions()
  },

  _loadActions: function () {
    if (!this.appInfo) {
      return
    }
    var actions
    try {
      actions = this.appInfo.list_actions()
    } catch (e) {
      clog('Error:  This version of cinnamon does not support actions.')
      return
    }
    if (actions.length && this.RecentMenuItems.length) {
      var seperator = new PopupMenu.PopupSeparatorMenuItem()
      this.specialSection.add(seperator.actor)
      this.RecentMenuItems.push(seperator)
    }

    var handleAction = (action)=>{
      var actionItem = new SpecialMenuItems.IconNameMenuItem(this, this.appInfo.get_action_name(action), 'window-new')
      actionItem.connect('activate', ()=>{
        this.appInfo.launch_action(action, global.create_app_launch_context())
        this.toggle()
      })
      this.specialSection.add(actionItem.actor)
      this.RecentMenuItems.push(actionItem)
    }

    for (let i = 0, len = actions.length; i < len; i++) {
      handleAction(actions[i])
    }
  },

  _listRecent: function (_recentItems=null) {
    var recentItems = _recentItems ? _recentItems : this._applet.recentItems
    var items = []
    for (let i = 0, len = recentItems.length; i < len; i++) {
      var mimeType = recentItems[i].get_mime_type()
      var appInfo = Gio.app_info_get_default_for_type(mimeType, false)
      if (appInfo && this.appInfo && appInfo.get_id() === this.app.get_id()) {
        items.push(recentItems[i])
      }
    }
    var itemsLength = items.length
    var num = this._applet.appMenuNum > 10 ? 10 : this._applet.appMenuNum
    if (itemsLength > num) {
      itemsLength = num
    }
    for (let i = 0; i < itemsLength; i++) {
      var recentMenuItem = new SpecialMenuItems.RecentMenuItem(this, items[i], 'list-add')
      this.specialSection.add(recentMenuItem.actor)
      this.RecentMenuItems.push(recentMenuItem)
    }
  },

  _listDefaultPlaces: function (pattern) {
    var defaultPlaces = Main.placesManager.getDefaultPlaces()
    var res = []
    for (let i = 0, len = defaultPlaces.length; i < len; i++) {
      if (!pattern || defaultPlaces[i].name.toLowerCase().indexOf(pattern) != -1) {
        res.push(defaultPlaces[i])
      }
    }
    return res
  },

  _listBookmarks: function (pattern) {
    var bookmarks = Main.placesManager.getBookmarks()
    var res = []
    for (let i = 0, len = bookmarks.length; i < len; i++) {
      if (!pattern || bookmarks[i].name.toLowerCase().indexOf(pattern) != -1) {
        res.push(bookmarks[i])
      }
    }
    return res
  },

  _listDevices: function (pattern) {
    var devices = Main.placesManager.getMounts()
    var res = []
    for (let i = 0, len = devices.length; i < len; i++) {
      if (!pattern || devices[i].name.toLowerCase().indexOf(pattern) != -1) {
        res.push(devices[i])
      }
    }
    return res
  },

  _isFavorite: function (isFav) {
    if (isFav) {
      this.box.add(this.subMenuItem.menu.actor)
      this.addMenuItem(this.subMenuItem)
      this._connectSubMenuSignals(this.subMenuItem, this.subMenuItem.menu)
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      if (this.RecentMenuItems.length) {
        this.box.add(this.specialCont.actor)
      }
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      this.addMenuItem(this.launchItem)

      if (!this.app.is_window_backed()) {
        if (this._applet.autoStart) {
          this.addMenuItem(this.itemToggleAutostart)
        }
        this.addMenuItem(this.itemtoggleFav)
      } else {
        this.addMenuItem(this.itemCreateShortcut)
      }
      this.isFavapp = true
    } else {
      if (this.monitorItems.length) {
        for (let i = 0, len = this.monitorItems.length; i < len; i++) {
          this.addMenuItem(this.monitorItems[i])
        }
        this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      }
      this.addMenuItem(this.itemOnAllWorkspaces)
      this.addMenuItem(this.itemMoveToLeftWorkspace)
      this.addMenuItem(this.itemMoveToRightWorkspace)
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      if (this.RecentMenuItems.length) {
        this.box.add(this.specialCont.actor)
      }
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      this.addMenuItem(this.launchItem)
      
      if (!this.app.is_window_backed()) {
        if (this._applet.autoStart) {
          this.addMenuItem(this.itemToggleAutostart)
        }
        if (this._applet.showPinned) {
          this.addMenuItem(this.itemtoggleFav)
        }
      } else {
        this.addMenuItem(this.itemCreateShortcut)
        this.addMenuItem(this.settingItem)
      }
      this.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())
      this.addMenuItem(this.itemMinimizeWindow)
      this.addMenuItem(this.itemMaximizeWindow)
      this.addMenuItem(this.itemCloseWindow)
      this.isFavapp = false
    }
  },

  _onParentActorButtonRelease: function (actor, event) {
    var button = event.get_button()
    if (button === 1) {
      if (this.isOpen) {
        this.toggle()
      }
    }
    if (button === 3) {
      this.mouseEvent = event
      this.toggle()
    }
    return true
  },

  _onParentActorButtonPress: function (actor, event) {
    var button = event.get_button()
    if (button === 3) {
      return true
    } 
  },

  _onToggled: function (actor, event) {
    if (!event || !this.metaWindow || !this.metaWindow.get_workspace()) {
      return
    }

    if (this.metaWindow.is_on_all_workspaces()) {
      this.itemOnAllWorkspaces.label.text = _('Only on this workspace')
      this.itemMoveToLeftWorkspace.actor.hide()
      this.itemMoveToRightWorkspace.actor.hide()
    } else {
      this.itemOnAllWorkspaces.label.text = _('Visible on all workspaces')
      if (this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.LEFT) != this.metaWindow.get_workspace()) {
        this.itemMoveToLeftWorkspace.actor.show()
      } else {
        this.itemMoveToLeftWorkspace.actor.hide()
      } 
        

      if (this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.RIGHT) != this.metaWindow.get_workspace()) {
        this.itemMoveToRightWorkspace.actor.show()
      } else {
        this.itemMoveToRightWorkspace.actor.hide()
      }
    }
    if (this.metaWindow.get_maximized()) {
      this.itemMaximizeWindow.label.text = _('Unmaximize')
    } else {
      this.itemMaximizeWindow.label.text = _('Maximize')
    }
    if (this.metaWindow.minimized) {
      this.itemMinimizeWindow.label.text = _('Restore')
    } else {
      this.itemMinimizeWindow.label.text = _('Minimize')
    }
  },

  _onWindowMinimized: function (actor, event) {},

  _onCloseAllActivate: function (actor, event) { // TBD
    //var workspace = this.metaWindow.get_workspace()
    var windows = l.map(this.metaWindows, 'win')
    for (let i = 0, len = windows.length; i < len; i++) {
      windows[i].delete(global.get_current_time())
    }
  },

  _onCloseWindowActivate: function (actor, event) {
    this.metaWindow.delete(global.get_current_time())
  },

  _onMinimizeWindowActivate: function (actor, event) {
    if (this.metaWindow.minimized) {
      this.metaWindow.unminimize(global.get_current_time())
      Main.activateWindow(this.metaWindow, global.get_current_time())
    } else {
      this.metaWindow.minimize(global.get_current_time())
    }
  },

  _onMaximizeWindowActivate: function (actor, event) {
    if (this.metaWindow.get_maximized()) {
      this.metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL)
    } else {
      this.metaWindow.maximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL)
    }
  },

  _onMoveToLeftWorkspace: function (actor, event) {
    var workspace = this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.LEFT)
    if (workspace) {
      this.metaWindow.change_workspace(workspace)
      Main._checkWorkspaces()
    }
  },

  _onMoveToRightWorkspace: function (actor, event) {
    var workspace = this.metaWindow.get_workspace().get_neighbor(Meta.MotionDirection.RIGHT)
    if (workspace) {
      this.metaWindow.change_workspace(workspace)
      Main._checkWorkspaces()
    }
  },

  _toggleOnAllWorkspaces: function (actor, event) {
    if (this.metaWindow.is_on_all_workspaces()) {
      this.metaWindow.unstick()
    } else {
      this.metaWindow.stick()
    }
  },

  _toggleAutostart(){
    if (this.autostartIndex !== -1) {
      this._applet.autostartApps[this.autostartIndex].file.delete(null)
      this._applet.removeAutostartApp(this.autostartIndex)
      this.autostartIndex = -1
      this.menuSetup(null)
    } else {
      var filePath = this.appInfo.get_filename()
      Util.trySpawnCommandLine(`bash -c "cp ${filePath} ${this._applet.autostartStrDir}"`)
      setTimeout(()=>{
        this._applet.getAutostartApps()
        this.autostartIndex = this._applet.autostartApps.length - 1
        this.menuSetup(null)
      }, 500)
    }
  },

  _toggleFav: function (actor, event) {
    if (this.isFav) {
      this.favs.removeFavorite(this.favId)
    } else {
      if (!this.app.is_window_backed()) {
        this.favs._addFavorite(this.favId, -1)
      }
    }
  },

  _createShortcut: function (actor, event) {
    var proc = this.app.get_windows()[0].get_pid()
    var cmd = `bash -c "python ~/.local/share/cinnamon/applets/IcingTaskManager@json/utils.py get_process ${proc.toString()}"`
    Util.trySpawnCommandLine(cmd)
  },

  _settingMenu: function () {
    Util.spawnCommandLine('cinnamon-settings applets IcingTaskManager@json')
  },

  removeItems: function () {
    this.blockSourceEvents = true
    var children = this._getMenuItems()
    for (var i = 0; i < children.length; i++) {
      var item = children[i]
      this.box.remove_actor(item.actor)
    }
    this.blockSourceEvents = false
  },

  destroy: function () {
    var isWindowBacked = this.app.is_window_backed();
    var items = this.RecentMenuItems
    for (let i = 0, len = items.length; i < len; i++) {
      items[i].destroy()
    }
    var children = this.subMenuItem.menu._getMenuItems()
    for (let i = 0, len = children.length; i < len; i++) {
      this.box.remove_actor(children[i].actor)
      if (!isWindowBacked) {
        children[i].destroy()
      }
    }
    if (!isWindowBacked) {
      this.subMenuItem.menu.destroy()
    }
    children = this._getMenuItems()
    for (let i = 0, len = children.length; i < len; i++) {
      this.box.remove_actor(children[i].actor)
    }
    this.box.destroy()
    this.actor.destroy()
  },

  _onSourceKeyPress: function (actor, event) {
    var symbol = event.get_key_symbol()
    if (symbol == Clutter.KEY_space || symbol == Clutter.KEY_Return) {
      this.menu.toggle()
      return true
    } else if (symbol == Clutter.KEY_Escape && this.menu.isOpen) {
      this.menu.close()
      return true
    } else if (symbol == Clutter.KEY_Down) {
      if (!this.menu.isOpen) {
        this.menu.toggle()
      }
      this.menu.actor.navigate_focus(this.actor, Gtk.DirectionType.DOWN, false)
      return true
    } else {
      return false
    } 
  },

  setMetaWindow: function (metaWindow, metaWindows) {
    // Last focused
    this.metaWindow = metaWindow

    // Window list from appGroup
    this.metaWindows = metaWindows
  }
}

function HoverMenuController (owner) {
  this._init(owner)
}

HoverMenuController.prototype = {
  __proto__: PopupMenu.PopupMenuManager.prototype,

  _onEventCapture: function (actor, event) {
    return false
  }
}

function AppThumbnailHoverMenu () {
  this._init.apply(this, arguments)
}

AppThumbnailHoverMenu.prototype = {
  __proto__: PopupMenu.PopupMenu.prototype,

  _init: function (parent) {
    this._applet = parent._applet
    if (parent._applet.c32) {
      PopupMenu.PopupMenu.prototype._init.call(this, parent.actor, parent.orientation, 0.5)
    } else {
      PopupMenu.PopupMenu.prototype._init.call(this, parent.actor, 0.5, parent.orientation)
    }

    this.metaWindow = parent.metaWindow
    this.metaWindows = []

    this.app = parent.app
    this.isFavapp = parent.isFavapp

    // need to implement this class or cinnamon outputs a bunch of errors // TBD
    this.actor.style_class = 'hide-arrow'

    this.box.style_class = 'thumbnail-popup-content'

    this.actor.hide()
    this.parentActor = parent.actor

    Main.layoutManager.addChrome(this.actor, this.orientation)

    this.appSwitcherItem = new PopupMenuAppSwitcherItem(this)
    this.addMenuItem(this.appSwitcherItem)

    this.parentActor.connect('enter-event', Lang.bind(this, this._onEnter))
    this.parentActor.connect('leave-event', Lang.bind(this, this._onLeave))
    this.parentActor.connect('button-release-event', Lang.bind(this, this._onButtonPress))

    this.actor.connect('enter-event', Lang.bind(this, this._onMenuEnter))
    this.actor.connect('leave-event', Lang.bind(this, this._onMenuLeave))

    this._applet.settings.connect('thumbnail-timeout', Lang.bind(this, function () {
      this.hoverTime = this._applet.settings.getValue('thumbnail-timeout')
    }))
    this.hoverTime = this._applet.settings.getValue('thumbnail-timeout')
  },

  _onButtonPress: function (actor, event) {
    if (this._applet.onclickThumbs && this.appSwitcherItem.appContainer.get_children().length > 1) {
      return
    }
    this.shouldOpen = false
    this.shouldClose = true
    setTimeout(()=>this.hoverClose(), this.hoverTime)
  },

  _onMenuEnter: function () {
    this.shouldOpen = true
    this.shouldClose = false

    setTimeout(()=>this.hoverOpen(), this.hoverTime)
  },

  _onMenuLeave: function () {
    this.shouldOpen = false
    this.shouldClose = true
    setTimeout(()=>this.hoverClose(), this.hoverTime)
  },

  _onEnter: function () {
    this.shouldOpen = true
    this.shouldClose = false

    setTimeout(()=>this.hoverOpen(), this.hoverTime)
  },

  _onLeave: function () {
    this.shouldClose = true
    this.shouldOpen = false

    setTimeout(()=>this.hoverClose(), this.hoverTime)
  },

  hoverOpen: function () {
    if (this.shouldOpen && !this.isOpen) {
      this.open(true)
    }
  },

  hoverClose: function () {
    if (this.shouldClose) {
      this.close(true)
    }
  },

  open: function (animate) {
    // Refresh all the thumbnails, etc when the menu opens.  These cannot
    // be created when the menu is initalized because a lot of the clutter window surfaces
    // have not been created yet...
    this.appSwitcherItem._refresh()
    this.appSwitcherItem.actor.show()
    PopupMenu.PopupMenu.prototype.open.call(this, animate)
  },

  close: function (animate) {
    PopupMenu.PopupMenu.prototype.close.call(this, animate)
    this.appSwitcherItem.actor.hide()
  },

  destroy: function () {
    var children = this._getMenuItems()
    for (var i = 0; i < children.length; i++) {
      var item = children[i]
      this.box.remove_actor(item.actor)
      item.actor.destroy()
    }
    this.box.destroy()
    this.actor.destroy()
  },

  setMetaWindow: function (metaWindow, metaWindows) {
    // Last focused
    this.metaWindow = metaWindow

    // Window list from appGroup
    this.appSwitcherItem.setMetaWindow(metaWindow, metaWindows)
    this.metaWindows = metaWindows
  }
}

// display a list of app thumbnails and allow
// bringing any app to focus by clicking on its thumbnail

function PopupMenuAppSwitcherItem () {
  this._init.apply(this, arguments)
}

PopupMenuAppSwitcherItem.prototype = {
  __proto__: PopupMenu.PopupBaseMenuItem.prototype,

  _init: function (parent, params) {
    params = Params.parse(params, {
      hover: false,
      activate: false
    })
    PopupMenu.PopupBaseMenuItem.prototype._init.call(this, params)

    this._applet = parent._applet
    this.metaWindow = parent.metaWindow
    this.metaWindows = []
    this.app = parent.app
    this.isFavapp = parent.isFavapp
    this._parentContainer = parent
    this.metaWindows = {}
    this.actor.style_class = ''

    this.box = new St.BoxLayout()
    this.box1 = new St.BoxLayout()
    this.box2 = new St.BoxLayout()
    this.box3 = new St.BoxLayout()

    this.appContainer = new St.BoxLayout({
      style_class: 'switcher-list'
    })
    // this.appContainer.style = "padding: 5px;"
    this.appContainer.add_style_class_name('thumbnail-row')

    this.appContainer2 = new St.BoxLayout({
      style_class: 'switcher-list'
    })

    // this.appContainer2.style = "padding: 5px;"
    this.appContainer2.add_style_class_name('thumbnail-row')
    this.appContainer2.hide()

    this.appContainer3 = new St.BoxLayout({
      style_class: 'switcher-list'
    })

    // this.appContainer3.style = "padding: 5px;"
    this.appContainer3.add_style_class_name('thumbnail-row')
    this.appContainer3.hide()

    this.appThumbnails = {}
    this.appThumbnails2 = {}
    this.appThumbnails3 = {}

    this._applet.settings.connect('changed::vertical-thumbnails', Lang.bind(this, this._setVerticalSetting))
    this._applet.settings.connect('changed::stack-thumbnails', Lang.bind(this, this._setStackThumbnailsSetting))
    this._setVerticalSetting()
    this.addActor(this.box)

    this._refresh()
  },

  _setVerticalSetting: function () {
    var vertical = this._applet.settings.getValue('vertical-thumbnails')
    if (vertical) {
      if (this.box.get_children().length > 0) {
        this.box.remove_actor(this.appContainer3)
        this.box.remove_actor(this.appContainer2)
        this.box.remove_actor(this.appContainer)
        this.box.add_actor(this.appContainer)
        this.box.add_actor(this.appContainer2)
        this.box.add_actor(this.appContainer3)
      } else {
        this.box.add_actor(this.appContainer)
        this.box.add_actor(this.appContainer2)
        this.box.add_actor(this.appContainer3)
      }
    } else {
      if (this.box.get_children().length > 0) {
        this.box.remove_actor(this.appContainer3)
        this.box.remove_actor(this.appContainer2)
        this.box.remove_actor(this.appContainer)
        this.box.add_actor(this.appContainer3)
        this.box.add_actor(this.appContainer2)
        this.box.add_actor(this.appContainer)
      } else {
        this.box.add_actor(this.appContainer3)
        this.box.add_actor(this.appContainer2)
        this.box.add_actor(this.appContainer)
      }
    }
    this.appContainer.vertical = vertical
    this.appContainer2.vertical = vertical
    this.appContainer3.vertical = vertical
    this.box.vertical = !vertical
  },

  _setStackThumbnailsSetting: function () {
    function removeChildren (parent, children) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i]
        parent.remove_actor(child)
      }
      parent.hide()
    }
    var children = this.appContainer.get_children()
    var children2 = this.appContainer2.get_children()
    var children3 = this.appContainer3.get_children()
    removeChildren(this.appContainer, children)
    removeChildren(this.appContainer2, children2)
    removeChildren(this.appContainer3, children3)
    this.reAdd = true
  },

  setMetaWindow: function (metaWindow, metaWindows) {
    this.metaWindow = metaWindow
    this.metaWindows = metaWindows
  },

  _isFavorite: function (isFav) {
    if (isFav) {
      this.isFavapp = true
    } else {
      this.isFavapp = false
    }
  },

  getMetaWindows: function () {
    if (this.metaWindow) {
      if (!this._applet.groupApps) {
        return [this.metaWindow]
      }
      this.metaWorkspace = this.metaWindow.get_workspace()
    } else if (!this.metaWorkspace) {
      return {}
    }
    return l.map(this.metaWindows, 'win')
  },

  _refresh: function () {
    // Check to see if this.metaWindow has changed.  If so, we need to recreate
    // our thumbnail, etc.
    // Get a list of all windows of our app that are running in the current workspace
    var windows = l.map(this.metaWindows, 'win')

    if (this.metaWindowThumbnail && this.metaWindowThumbnail.needs_refresh()) {
      this.metaWindowThumbnail = null
    }
    if (this.metaWindowThumbnail && this.metaWindowThumbnail.metaWindow == this.metaWindow) {
      this.metaWindowThumbnail._isFavorite(this.isFavapp)
    } else {
      if (this.metaWindowThumbnail) {
        this.metaWindowThumbnail.destroy()
      }
      // If our metaWindow is null, just move along
      if (this.isFavapp) {
        this.metaWindowThumbnail = new WindowThumbnail(this, this.metaWindow)
        this.appContainer.insert_actor(this.metaWindowThumbnail.actor, 0)
        setTimeout(()=>this.setStyleOptions(null), 0)
        // Update appThumbnails to remove old programs
        this.removeOldWindows(windows)
        return
      }
    }
    // Update appThumbnails to include new programs
    this.addNewWindows(windows)
    // Update appThumbnails to remove old programs
    this.removeOldWindows(windows)
    // Set to true to readd the thumbnails; used for the sorting by last focused 
    this.reAdd = false
    // used to make sure everything is on the stage
    setTimeout(()=>this.setStyleOptions(windows), 0)
  },
  addNewWindows: function (windows) {
    var ThumbnailWidth = Math.floor((Main.layoutManager.primaryMonitor.width / 70) * this._applet.thumbSize) + 16
    var ThumbnailHeight = Math.floor((Main.layoutManager.primaryMonitor.height / 70) * this._applet.thumbSize) + 16
    if (!this._applet.showThumbs) {
      ThumbnailHeight /= 3
    }

    var moniterSize, thumbnailSize
    if (this._applet.settings.getValue('vertical-thumbnails')) {
      moniterSize = Main.layoutManager.primaryMonitor.height
      thumbnailSize = ThumbnailHeight
    } else {
      moniterSize = Main.layoutManager.primaryMonitor.width
      thumbnailSize = ThumbnailWidth
    }
    if ((thumbnailSize * windows.length) + thumbnailSize >= moniterSize && this._applet.settings.getValue('stack-thumbnails')) {
      this.thumbnailsSpace = Math.floor((moniterSize - 100) / thumbnailSize)
      var firstLoop = this.thumbnailsSpace
      var nextLoop = firstLoop + this.thumbnailsSpace
      if (windows.length < firstLoop) {
        firstLoop = windows.length
      }
      this.addWindowsLoop(0, firstLoop, this.appContainer, windows, 1)
      if (windows.length > nextLoop) {
        this.addWindowsLoop(firstLoop, nextLoop, this.appContainer2, windows, 2)
      } else if (windows.length > firstLoop) {
        this.addWindowsLoop(firstLoop, windows.length, this.appContainer2, windows, 2)
      }
      if (windows.length > nextLoop) {
        this.addWindowsLoop(nextLoop, windows.length, this.appContainer3, windows, 3)
      }
    } else {
      this.addWindowsLoop(0, windows.length, this.appContainer, windows, 1)
    }
  },

  addWindowsLoop: function (i, winLength, actor, windows, containerNum) {
    if (this._applet.sortThumbs && windows.length > 0) {
      var children = actor.get_children()
      for (var w = 0; w < children.length; w++) {
        actor.remove_actor(children[w])
      }
      windows.sort(function (a, b) {
        return a.user_time - b.user_time
      })
      this.reAdd = true
    }
    for (i; i < winLength; i++) {
      var metaWindow = windows[i]
      if (this.appThumbnails[metaWindow]) {
        this.appThumbnails[metaWindow].thumbnail._isFavorite(this.isFavapp)
        if (this.reAdd) {
          if (this._applet.sortThumbs) {
            actor.insert_actor(this.appThumbnails[metaWindow].thumbnail.actor, 0)
          } else {
            actor.add_actor(this.appThumbnails[metaWindow].thumbnail.actor)
          }
        }
      } else {
        var thumbnail = new WindowThumbnail(this, metaWindow)
        this.appThumbnails[metaWindow] = {
          metaWindow: metaWindow,
          thumbnail: thumbnail,
          cont: containerNum
        }
        if (this._applet.sortThumbs) {
          actor.insert_actor(this.appThumbnails[metaWindow].thumbnail.actor, 0)
        } else {
          actor.add_actor(this.appThumbnails[metaWindow].thumbnail.actor)
        }
      }
    }
    actor.show()
  },
  setStyleOptions: function (windows) {
    this.appContainer.style = null
    this.box.style = null
    var thumbnailTheme = this.appContainer.peek_theme_node()
    var padding = thumbnailTheme ? thumbnailTheme.get_horizontal_padding() : null
    var thumbnailPadding = (padding && (padding > 1 && padding < 21) ? padding : 10)
    this.appContainer.style = 'padding:' + (thumbnailPadding / 2) + 'px'
    this.appContainer2.style = 'padding:' + (thumbnailPadding / 2) + 'px'
    this.appContainer3.style = 'padding:' + (thumbnailPadding / 2) + 'px'
    var boxTheme = this.box.peek_theme_node()
    padding = boxTheme ? boxTheme.get_vertical_padding() : null
    var boxPadding = (padding && (padding > 0) ? padding : 3)
    this.box.style = 'padding:' + boxPadding + 'px;'
    if (this.isFavapp) {
      this.metaWindowThumbnail.thumbnailIconSize()
      return
    }
    if (windows === null) {
      return
    }
    for (var i in this.appThumbnails) {
      if (this.appThumbnails[i].thumbnail) {
        this.appThumbnails[i].thumbnail.thumbnailIconSize()
      }
    }
  },

  removeOldWindows: function (windows) {
    for (var win in this.appThumbnails) {
      if (windows.indexOf(this.appThumbnails[win].metaWindow) == -1) {
        if (this.appThumbnails[win].cont == 1) {
          this.appContainer.remove_actor(this.appThumbnails[win].thumbnail.actor)
        } else if (this.appThumbnails[win].cont == 2) {
          this.appContainer2.remove_actor(this.appThumbnails[win].thumbnail.actor)
        } else if (this.appThumbnails[win].cont == 3) {
          this.appContainer3.remove_actor(this.appThumbnails[win].thumbnail.actor)
        }
        this.appThumbnails[win].thumbnail.destroy()
        delete this.appThumbnails[win]
      }
    }
  },

  refreshRows: function () {
    var appContLength = this.appContainer.get_children().length
    var appContLength2 = this.appContainer2.get_children().length
    if (appContLength < 1) {
      this._parentContainer.shouldOpen = false
      this._parentContainer.shouldClose = true
      this._parentContainer.hoverClose()
    }

    if (appContLength < this.thumbnailsSpace && appContLength2 > 0) {
      let children = this.appContainer2.get_children()
      let thumbsToMove = (this.thumbnailsSpace - appContLength)
      for (let i = 0; i < thumbsToMove; i++) {
        let actor = children[i] ? children[i] : null
        if (actor === null) {
          break
        }
        this.appContainer2.remove_actor(actor)
        this.appContainer.add_actor(actor)
        this.appThumbnails[actor._delegate.metaWindow].cont = 1
      }
    }

    appContLength2 = this.appContainer2.get_children().length
    var appContLength3 = this.appContainer3.get_children().length

    if (appContLength2 <= 0) {
      this.appContainer2.hide()
    }

    if (appContLength2 < this.thumbnailsSpace && appContLength3 > 0) {
      let children = this.appContainer3.get_children()
      let thumbsToMove = (this.thumbnailsSpace - appContLength2)
      for (let i = 0; i < thumbsToMove; i++) {
        let actor = children[i] ? children[i] : null
        if (actor === null) {
          break
        }
        this.appContainer3.remove_actor(actor)
        this.appContainer2.add_actor(actor)
        this.appThumbnails[actor._delegate.metaWindow].cont = 2
      }
    }

    if (this.appContainer3.get_children().length <= 0) {
      this.appContainer3.hide()
    }
  }
}

function WindowThumbnail () {
  this._init.apply(this, arguments)
}

WindowThumbnail.prototype = {
  _init: function (parent, metaWindow) {
    this._applet = parent._applet
    this.metaWindow = metaWindow || null
    this.app = parent.app
    this.isFavapp = parent.isFavapp || false
    this.wasMinimized = false
    this._parent = parent
    this._parentContainer = parent._parentContainer
    this.thumbnailPadding = 16

    // Inherit the theme from the alt-tab menu
    this.actor = new St.BoxLayout({
      style_class: 'item-box',
      reactive: true,
      track_hover: true,
      vertical: true
    })
    this.actor._delegate = this
    // Override with own theme.
    this.actor.add_style_class_name('thumbnail-box')
    this.thumbnailActor = new St.Bin()

    this._container = new St.BoxLayout({
      style_class: this._applet.thumbCloseBtnStyle ? 'thumbnail-iconlabel' : 'thumbnail-iconlabel-cont'
    })

    var bin = new St.BoxLayout({
      style_class: 'thumbnail-label-bin'
    })

    this.icon = this.app.create_icon_texture(32)
    this.themeIcon = new St.BoxLayout({
      style_class: 'thumbnail-icon'
    })
    this.themeIcon.add_actor(this.icon)
    this._container.add_actor(this.themeIcon)
    this._label = new St.Label({
      style_class: 'thumbnail-label'
    })
    this._container.add_actor(this._label)
    this.button = new St.BoxLayout({
      style_class: this._applet.thumbCloseBtnStyle ? 'window-close' : 'thumbnail-close',
      style: this._applet.thumbCloseBtnStyle ? 'padding: 0px; width: 16px; height: 16px; max-width: 16px; max-height: 16px;' : null,
      reactive: true
    })

    this.button.hide()
    bin.add_actor(this._container)
    bin.add_actor(this.button)
    this.actor.add_actor(bin)
    this.actor.add_actor(this.thumbnailActor)

    if (this.isFavapp) {
      this._isFavorite(true)
    } else {
      this._isFavorite(false)
    }

    if (this.metaWindow) {
      this.metaWindow.connect('notify::title', ()=> {
        this._label.text = this.metaWindow.get_title()
      })
      this._updateAttentionGrabber(null, null, this._applet.showAlerts)
      this._applet.settings.connect('changed::show-alerts', Lang.bind(this, this._updateAttentionGrabber))
      this.tracker = Cinnamon.WindowTracker.get_default()
      this._trackerSignal = this.tracker.connect('notify::focus-app', Lang.bind(this, this._onFocusChange))
    }
    this.actor.connect('enter-event', ()=>{
      if (!this.isFavapp) {
        var parent = this._parent._parentContainer
        parent.shouldOpen = true
        parent.shouldClose = false
        this._hoverPeek(this._applet.peekOpacity, this.metaWindow, true)
        this.actor.add_style_pseudo_class('outlined')
        this.actor.add_style_pseudo_class('selected')
        this.button.show()
        if (this.metaWindow.minimized && this._applet.enablePeek  && this.app.get_name() !== 'Steam') {
          this.metaWindow.unminimize()
          if (this.metaWindow.is_fullscreen()) {
            this.metaWindow.unmaximize(global.get_current_time())
          }
          this.wasMinimized = true
        } else {
          this.wasMinimized = false
        }
      }
    })
    this.actor.connect('leave-event', Lang.bind(this, function () {
      if (!this.isFavapp) {
        this._hoverPeek(OPACITY_OPAQUE, this.metaWindow, false)
        this.actor.remove_style_pseudo_class('outlined')
        this.actor.remove_style_pseudo_class('selected')
        this.button.hide()
        if (this.wasMinimized) {
          this.metaWindow.minimize(global.get_current_time())
        }
      }
    }))
    this.button.connect('button-release-event', Lang.bind(this, this._onButtonRelease))

    this.actor.connect('button-release-event', Lang.bind(this, this._connectToWindow))
  },

  _updateAttentionGrabber: function (obj, oldVal, newVal) {
    if (newVal) {
      this._urgent_signal = global.display.connect('window-marked-urgent', Lang.bind(this, this._onWindowDemandsAttention))
      this._attention_signal = global.display.connect('window-demands-attention', Lang.bind(this, this._onWindowDemandsAttention))
    } else {
      if (this._urgent_signal) {
        global.display.disconnect(this._urgent_signal)
      }
      if (this._attention_signal) {
        global.display.disconnect(this._attention_signal)
      }
    }
  },

  _onWindowDemandsAttention: function (display, window) {
    if (this._needsAttention) {
      return false
    }
    this._needsAttention = true
    if (this.metaWindow == window) {
      this.actor.add_style_class_name('thumbnail-alerts')
      return true
    }
    return false
  },

  _onFocusChange: function () {
    if (this._hasFocus()) {
      this.actor.remove_style_class_name('thumbnail-alerts')
    }
  },

  _hasFocus: function () {
    if (this.metaWindow.minimized) {
      return false
    }

    if (this.metaWindow.has_focus()) {
      return true
    }

    var transientHasFocus = false
    this.metaWindow.foreach_transient(function (transient) {
      if (transient.has_focus()) {
        transientHasFocus = true
        return false
      }
      return true
    })
    return transientHasFocus
  },

  _isFavorite: function (isFav) {
    // Whether we create a favorite tooltip or a window thumbnail
    if (isFav) {
      // this.thumbnailActor.height = 0
      // this.thumbnailActor.width = 0
      this.thumbnailActor.child = null
      var apptext = this.app.get_name()
      // not sure why it's 7
      this.ThumbnailWidth = THUMBNAIL_ICON_SIZE + Math.floor(apptext.length * 7.0)
      this._label.text = apptext
      this.isFavapp = true
      this.actor.style = 'border-width:2px;padding: 2px'
    } else {
      this.actor.style = null
      // HACK used to make sure everything is on the stage
      setTimeout(()=>this.thumbnailPaddingSize(), 0)
      this._refresh()
    }
  },

  destroy: function () {
    try {
      if (this._trackerSignal) {
        this.tracker.disconnect(this._trackerSignal)
      }
      if (this._urgent_signal) {
        global.display.disconnect(this._urgent_signal)
      }
      if (this._attention_signal) {
        global.display.disconnect(this._attention_signal)
      }
    } catch (e) {
      /* Signal is invalid */
    }
    delete this._parent.appThumbnails[this.metaWindow]
    this.actor.destroy_children()
    this.actor.destroy()
  },

  needs_refresh: function () {
    return Boolean(this.thumbnail)
  },

  thumbnailIconSize: function () {
    var thumbnailTheme = this.themeIcon.peek_theme_node()
    if (thumbnailTheme) {
      var width = thumbnailTheme.get_width()
      var height = thumbnailTheme.get_height()
      this.icon.set_size(width, height)
    }
  },

  thumbnailPaddingSize: function () {
    var thumbnailTheme = this.actor.peek_theme_node()
    var padding = thumbnailTheme ? thumbnailTheme.get_horizontal_padding() : null
    this.thumbnailPadding = (padding && (padding > 3 && padding < 21) ? padding : 12)
    this.actor.style = 'border-width:2px;padding:' + ((this.thumbnailPadding / 2)) + 'px;'
  },

  _getThumbnail: function () {
    // Create our own thumbnail if it doesn'_ exist
    var thumbnail = null
    var muffinWindow = this.metaWindow.get_compositor_private()
    if (muffinWindow) {
      var windowTexture = muffinWindow.get_texture()
      let [width, height] = windowTexture.get_size()
      var scale = Math.min(1.0, this.ThumbnailWidth / width, this.ThumbnailHeight / height)
      thumbnail = new Clutter.Clone({
        source: windowTexture,
        reactive: true,
        width: width * scale,
        height: height * scale
      })
    }

    return thumbnail
  },

  _onButtonRelease: function (actor, event) {
    if (event.get_state() & Clutter.ModifierType.BUTTON1_MASK && actor == this.button) {
      this.destroy()
      this.stopClick = true
      this._hoverPeek(OPACITY_OPAQUE, this.metaWindow, false)
      this._parentContainer.shouldOpen = false
      this._parentContainer.shouldClose = true
      Mainloop.timeout_add(2000, Lang.bind(this._parentContainer, this._parentContainer.hoverClose))
      this.metaWindow.delete(global.get_current_time())
      this._parent.refreshRows()
    }
  },

  _connectToWindow: function (actor, event) {
    this.wasMinimized = false
    if (event.get_state() & Clutter.ModifierType.BUTTON1_MASK && !this.stopClick && !this.isFavapp) {
      Main.activateWindow(this.metaWindow, global.get_current_time())
      var parent = this._parent._parentContainer
      parent.shouldOpen = false
      parent.shouldClose = true
      Mainloop.timeout_add(parent.hoverTime, Lang.bind(parent, parent.hoverClose))
    } else if (event.get_state() & Clutter.ModifierType.BUTTON2_MASK && !this.stopClick) {
      this.stopClick = true
      this.destroy()
      this._hoverPeek(OPACITY_OPAQUE, this.metaWindow, false)
      this._parentContainer.shouldOpen = false
      this._parentContainer.shouldClose = true
      Mainloop.timeout_add(3000, Lang.bind(this._parentContainer, this._parentContainer.hoverClose))
      this.metaWindow.delete(global.get_current_time())
      this._parent.refreshRows()
    }
    this.stopClick = false
  },

  _refresh: function () {
    // Turn favorite tooltip into a normal thumbnail
    var moniter = Main.layoutManager.monitors[this.metaWindow.get_monitor()]
    this.ThumbnailHeight = Math.floor(moniter.height / 70) * this._applet.thumbSize
    this.ThumbnailWidth = Math.floor(moniter.width / 70) * this._applet.thumbSize
    // this.thumbnailActor.height = this.ThumbnailHeight
    this.thumbnailActor.width = this.ThumbnailWidth
    this._container.style = 'width: ' + Math.floor(this.ThumbnailWidth - 16) + 'px'
    this.isFavapp = false

    // Replace the old thumbnail
    var title = this.metaWindow.get_title()
    this._label.text = title
    if (this._applet.showThumbs) {
      this.thumbnail = this._getThumbnail()
      this.thumbnailActor.child = this.thumbnail
    } else {
      this.thumbnailActor.child = null
    }
  },

  _hoverPeek: function (opacity, metaWin, enterEvent) {
    var applet = this._applet
    if (!applet.enablePeek) {
      return
    }

    function setOpacity (window_actor, target_opacity) {
      Tweener.addTween(window_actor, {
        time: applet.peekTime * 0.001,
        transition: 'easeOutQuad',
        opacity: target_opacity
      })
    }
    var monitorOrigin = metaWin.get_monitor()
    var wa = global.get_window_actors()
    for (let i = 0, len = wa.length; i < len; i++) {
      var waWin = wa[i].get_meta_window()
      if (metaWin === waWin || waWin.get_monitor() !== monitorOrigin) {
        continue
      }

      if (waWin.get_window_type() !== Meta.WindowType.DESKTOP) {
        setOpacity(wa[i], opacity)
      }
    }
  }
}
