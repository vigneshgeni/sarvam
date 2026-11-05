require 'xcodeproj'

project_path = File.expand_path('../../App/App.xcodeproj', __FILE__)
project = Xcodeproj::Project.open(project_path)

puts "Loaded Xcode project at #{project_path}"

app_target = project.targets.find { |t| t.name == 'App' }
raise "Could not find 'App' target" unless app_target

# Groups
main_group = project.main_group
app_group = main_group.find_subpath('App', true)
widget_group = main_group.find_subpath('SarvamWidgetExtension', true)

# Files for main App
app_files = [
  'SceneDelegate.swift',
  'SarvamActivityAttributes.swift',
  'SarvamAudioPlayer.swift',
  'SarvamLiveActivityPlugin.swift'
]

app_files.each do |filename|
  filepath = File.expand_path("../../App/App/#{filename}", __FILE__)
  file_ref = app_group.find_file_by_path(filename) || app_group.new_file(filepath)
  unless app_target.source_build_phase.files_references.include?(file_ref)
    app_target.add_file_references([file_ref])
    puts "Added #{filename} to App target"
  end
end

# Check if SarvamWidgetExtension target already exists
widget_target = project.targets.find { |t| t.name == 'SarvamWidgetExtension' }

unless widget_target
  puts "Creating SarvamWidgetExtension target..."
  widget_target = project.new_target(:app_extension, 'SarvamWidgetExtension', :ios, '17.0', project.products_group)
end

# Files for Widget Extension
widget_files = [
  'SarvamActivityWidget.swift',
  'SarvamLiveActivityIntents.swift',
  'SarvamActivityAttributes.swift',
  'SarvamAudioPlayer.swift'
]

widget_files.each do |filename|
  # Determine path
  if filename.start_with?('SarvamActivityAttributes') || filename.start_with?('SarvamAudioPlayer')
    filepath = File.expand_path("../../App/App/#{filename}", __FILE__)
  else
    filepath = File.expand_path("../../App/SarvamWidgetExtension/#{filename}", __FILE__)
  end
  file_ref = widget_group.find_file_by_path(filename) || widget_group.new_file(filepath)
  unless widget_target.source_build_phase.files_references.include?(file_ref)
    widget_target.add_file_references([file_ref])
    puts "Added #{filename} to SarvamWidgetExtension target"
  end
end

# Add Info.plist reference
info_plist_path = File.expand_path("../../App/SarvamWidgetExtension/Info.plist", __FILE__)
widget_group.find_file_by_path('Info.plist') || widget_group.new_file(info_plist_path)

# Configure build settings for SarvamWidgetExtension
widget_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_NAME'] = 'SarvamWidgetExtension'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.sarvam.app.widget'
  config.build_settings['INFOPLIST_FILE'] = 'SarvamWidgetExtension/Info.plist'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
  config.build_settings['CODE_SIGN_IDENTITY'] = ''
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = config.name == 'Debug' ? 'DEBUG' : ''
end

# Ensure App target depends on widget_target
unless app_target.dependencies.any? { |d| d.target == widget_target }
  app_target.add_dependency(widget_target)
  puts "Added widget_target dependency to App"
end

# Ensure Embed App Extensions phase exists in App
embed_phase = app_target.copy_files_build_phases.find { |p| p.name == 'Embed App Extensions' || p.dst_subfolder_spec == 13 }
unless embed_phase
  embed_phase = app_target.new_copy_files_build_phase('Embed App Extensions')
  embed_phase.dst_subfolder_spec = "13" # PlugIns
  embed_phase.dst_path = ""
  puts "Created 'Embed App Extensions' build phase"
end

unless embed_phase.files_references.include?(widget_target.product_reference)
  build_file = embed_phase.add_file_reference(widget_target.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
  puts "Added widget product reference to Embed App Extensions"
end

project.save
puts "Successfully configured and saved Xcode project with SarvamWidgetExtension!"
